// Importazione una tantum di un catalogo di prodotti (dati + foto) preparato in server/import/<chiave>/.
// Idempotente: il file products.json viene salvato nell'archivio con id `import-<chiave>`;
// se quel record esiste l'importazione è già avvenuta e non viene ripetuta
// (così i prodotti modificati o eliminati in seguito dagli utenti non ricompaiono).
import type { Store } from './store';
import type { BlobStorage } from './deps';

export type CatalogImport = {
  key: string;
  removeDemo?: string[];
  products: (Record<string, unknown> & { id: string; images: string[]; listPrice?: number })[];
};

export async function importCatalog(store: Store, storage: BlobStorage, manifest: CatalogImport, raw: Uint8Array,
  readImage: (name: string) => Promise<Uint8Array>): Promise<number> {
  const markerId = `import-${manifest.key}`;
  if (await store.get('files', markerId)) return 0;
  const now = new Date().toISOString();

  for (const id of manifest.removeDemo || []) {
    const p = await store.get<{ images: string[] }>('products', id);
    if (p && p.images.every(src => src.startsWith('https://images.unsplash.com/'))) await store.remove('products', { id });
  }

  let added = 0;
  for (const { listPrice: _list, images, ...p } of manifest.products) {
    if (await store.get('products', p.id)) continue;
    const urls: string[] = [];
    for (const name of images) {
      const id = `${manifest.key}-${name.replace(/\.[a-z]+$/, '')}`;
      if (!(await store.get('files', id))) {
        const data = await readImage(name);
        const storageKey = `imports/${manifest.key}/${name}`;
        await storage.put(storageKey, data, 'image/jpeg');
        await store.insert('files', { id, storageKey, fileName: name, mime: 'image/jpeg', size: data.byteLength, createdBy: null, createdAt: now });
      }
      urls.push(`/api/files/${id}`);
    }
    await store.insert('products', { ...p, images: urls, createdAt: now, updatedAt: now });
    added++;
  }

  const storageKey = `imports/${manifest.key}/products.json`;
  await storage.put(storageKey, raw, 'application/json');
  await store.insert('files', { id: markerId, storageKey, fileName: 'products.json', mime: 'application/json', size: raw.byteLength, createdBy: null, createdAt: now });
  return added;
}

/**
 * Aggiunge il prezzo di listino ai prodotti importati prima che il campo esistesse e toglie
 * dalla descrizione la vecchia nota "Prezzo di listino … · Prezzo Peverelli …".
 * Tocca solo le composizioni ancora senza listino e con il prezzo expo invariato.
 */
export async function applyListPrices(store: Store, manifest: CatalogImport): Promise<number> {
  type Cfg = { name: string; dims: string; price?: number; listPrice?: number };
  let changed = 0;
  for (const m of manifest.products) {
    const want = (m.configs as Cfg[] | undefined)?.[0];
    if (want?.listPrice === undefined) continue;
    const p = await store.get<{ configs: Cfg[]; description: string; updatedAt: string }>('products', m.id);
    const first = p?.configs[0];
    if (!p || !first || first.listPrice !== undefined || first.price !== want.price) continue;
    const description = p.description.replace(/\n\nPrezzo di listino: [^\n]*$/, old => {
      const qty = old.match(/Disponibili (\d+) pezzi/);
      return qty ? `\n\nDisponibili ${qty[1]} pezzi; prezzi cadauno.` : '';
    });
    await store.update('products', m.id, { configs: [{ ...first, listPrice: want.listPrice }, ...p.configs.slice(1)], description, updatedAt: new Date().toISOString() });
    changed++;
  }
  return changed;
}

export type MaterialImport = {
  key: string; brand: string; category: string; name: string; notes?: string;
  swatches: { code: string; name: string; image: string; sources?: { catalog: string; original: string; sha256: string }[] }[];
  /** Collezioni doppie dello stesso marchio da unire in questa (stessi codici colore): i loro campioni diventano provenienze. */
  mergeFrom?: string[];
};
type Row = { id: string; [k: string]: unknown };
const mimeOf = (name: string) => /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg';

/** Importa una collezione di materiali una sola volta (con provenienze per catalogo); non ricrea ciò che l'utente ha eliminato. */
export async function importMaterialCollection(store: Store, storage: BlobStorage, m: MaterialImport, readImage: (name: string) => Promise<Uint8Array>): Promise<{ added: number; merged: number }> {
  const markerId = `import-${m.key}`;
  const now = new Date().toISOString();
  const findCol = async () => (await store.all<Row & { brand: string; name: string }>('materialCollections')).find(c => c.brand.toLowerCase() === m.brand.toLowerCase() && c.name.toLowerCase() === m.name.toLowerCase());
  let added = 0;
  const ensureFile = async (id: string, name: string, data?: Uint8Array) => {
    if (await store.get('files', id)) return id;
    const bytes = data ?? await readImage(name); const storageKey = `imports/${m.key}/${name}`;
    await storage.put(storageKey, bytes, mimeOf(name));
    await store.insert('files', { id, storageKey, fileName: name, mime: mimeOf(name), size: bytes.byteLength, createdBy: null, createdAt: now });
    return id;
  };
  const upsertSource = async (swatchId: string, catalog: string, fileId: string | null, sha256: string | null) => {
    const have = (await store.all<Row & { catalog: string; fileId: string | null }>('materialSwatchSources', { swatchId })).find(x => x.catalog.toLowerCase() === catalog.toLowerCase());
    if (have) { if (!have.fileId && fileId) await store.update('materialSwatchSources', have.id, { fileId }); return; }
    await store.insert('materialSwatchSources', { id: crypto.randomUUID(), swatchId, catalog, fileId, sha256, createdAt: now });
  };

  let col = await findCol();
  if (!(await store.get('files', markerId))) {
    if (!col) col = await store.insert<Row & { brand: string; name: string }>('materialCollections', { id: `mc-${m.key}`, brand: m.brand, category: m.category, name: m.name, notes: m.notes ?? '', createdBy: null, createdAt: now });
    const colId = col.id;
    const existing = await store.all<Row & { code: string }>('materialSwatches', { collectionId: colId });
    let pos = existing.length;
    for (const s of m.swatches) {
      let sw = existing.find(e => e.code === s.code);
      if (!sw) {
        const fileId = await ensureFile(`${m.key}-${s.code}`.replace(/[^\w-]/g, '-'), s.image);
        sw = await store.insert<Row & { code: string }>('materialSwatches', { id: `ms-${m.key}-${s.code}`.replace(/[^\w-]/g, '-'), collectionId: colId, code: s.code, name: s.name, fileId, position: ++pos });
        added++;
      }
      for (const src of s.sources ?? []) await upsertSource(sw.id, src.catalog, await ensureFile(`${m.key}-src-${src.sha256.slice(0, 16)}`, src.original), src.sha256);
    }
    const raw = new TextEncoder().encode(JSON.stringify(m));
    await storage.put(`imports/${m.key}/collection.json`, raw, 'application/json');
    await store.insert('files', { id: markerId, storageKey: `imports/${m.key}/collection.json`, fileName: 'collection.json', mime: 'application/json', size: raw.byteLength, createdBy: null, createdAt: now });
  }

  // unione delle collezioni doppie (es. "PELLE 403" e "PELLE 411", che contengono la stessa cartella colori)
  let merged = 0;
  if (col && m.mergeFrom?.length) {
    const canonId = col.id;
    const canon = await store.all<Row & { code: string }>('materialSwatches', { collectionId: canonId });
    for (const dup of (await store.all<Row & { brand: string; name: string }>('materialCollections')).filter(c => c.id !== canonId && c.brand.toLowerCase() === m.brand.toLowerCase() && m.mergeFrom!.some(n => n.toLowerCase() === c.name.toLowerCase()))) {
      for (const ds of await store.all<Row & { code: string; fileId: string | null }>('materialSwatches', { collectionId: dup.id })) {
        const target = canon.find(x => x.code === ds.code);
        if (!target) { await store.update('materialSwatches', ds.id, { collectionId: canonId }); canon.push(ds); continue; }
        await upsertSource(target.id, dup.name, ds.fileId, null);
        for (const x of await store.all<Row & { catalog: string; fileId: string | null; sha256: string | null }>('materialSwatchSources', { swatchId: ds.id })) await upsertSource(target.id, x.catalog, x.fileId, x.sha256);
        await store.remove('materialSwatchSources', { swatchId: ds.id });
        await store.remove('materialSwatches', { id: ds.id });
      }
      for (const p of await store.all<Row & { materialCollectionIds?: string[] }>('products'))
        if (p.materialCollectionIds?.includes(dup.id)) await store.update('products', p.id, { materialCollectionIds: [...new Set(p.materialCollectionIds.map(x => x === dup.id ? canonId : x))] });
      await store.remove('materialCollections', { id: dup.id });
      merged++;
    }
  }
  return { added, merged };
}
