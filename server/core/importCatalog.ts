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

export type MaterialImport = { key: string; brand: string; category: string; name: string; notes?: string; swatches: { code: string; name: string; image: string }[] };

/** Importa una collezione di materiali (es. Flexform PELLE 411) una sola volta; non ricrea ciò che l'utente ha eliminato. */
export async function importMaterialCollection(store: Store, storage: BlobStorage, m: MaterialImport, readImage: (name: string) => Promise<Uint8Array>): Promise<number> {
  const markerId = `import-${m.key}`;
  if (await store.get('files', markerId)) return 0;
  const now = new Date().toISOString();
  const all = await store.all<{ id: string; brand: string; name: string }>('materialCollections');
  let col = all.find(c => c.brand.toLowerCase() === m.brand.toLowerCase() && c.name.toLowerCase() === m.name.toLowerCase());
  if (!col) col = await store.insert<{ id: string; brand: string; name: string }>('materialCollections', { id: `mc-${m.key}`, brand: m.brand, category: m.category, name: m.name, notes: m.notes ?? '', createdBy: null, createdAt: now });
  const colId = col.id;
  const existing = await store.all<{ code: string }>('materialSwatches', { collectionId: colId });
  let added = 0, pos = existing.length;
  for (const s of m.swatches) {
    if (existing.some(e => e.code === s.code)) continue;
    const data = await readImage(s.image);
    const fileId = `${m.key}-${s.code}`.replace(/[^\w-]/g, '-');
    const storageKey = `imports/${m.key}/${s.image}`;
    await storage.put(storageKey, data, 'image/jpeg');
    if (!(await store.get('files', fileId))) await store.insert('files', { id: fileId, storageKey, fileName: s.image, mime: 'image/jpeg', size: data.byteLength, createdBy: null, createdAt: now });
    await store.insert('materialSwatches', { id: `ms-${fileId}`, collectionId: colId, code: s.code, name: s.name, fileId, position: ++pos });
    added++;
  }
  const raw = new TextEncoder().encode(JSON.stringify(m));
  await storage.put(`imports/${m.key}/collection.json`, raw, 'application/json');
  await store.insert('files', { id: markerId, storageKey: `imports/${m.key}/collection.json`, fileName: 'collection.json', mime: 'application/json', size: raw.byteLength, createdBy: null, createdAt: now });
  return added;
}
