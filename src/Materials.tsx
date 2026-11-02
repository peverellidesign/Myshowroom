// Campionario materiali nella scheda prodotto (Materiali & Colori) e import di nuove collezioni da ZIP.
import { useMemo, useState } from 'react';
import { Archive, Check, Trash2, X, ZoomIn } from 'lucide-react';
import { ApiError, del, post, upload } from './api';
import { Img } from './Img';
import { readZip, parseCsv } from './zip';
import { MATERIAL_CATEGORIES, type MaterialCollection, type MaterialSwatch, type Product } from '../shared/types';

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
/** Collezioni disponibili per il prodotto: quelle scelte nella scheda, altrimenti tutte quelle del marchio. */
export const collectionsFor = (p: Product, all: MaterialCollection[]) =>
  p.materialCollectionIds?.length ? all.filter(c => p.materialCollectionIds!.includes(c.id)) : all.filter(c => norm(c.brand) === norm(p.brand));
export const swatchSrc = (s: Pick<MaterialSwatch, 'fileId'>) => (s.fileId ? `/api/files/${s.fileId}` : '');

export function SwatchPicker({ collections, selected, onSelect, canManage, onDeleteCollection }: {
  collections: MaterialCollection[]; selected: MaterialSwatch | null; onSelect: (s: MaterialSwatch | null) => void;
  canManage?: boolean; onDeleteCollection?: (c: MaterialCollection) => void;
}) {
  const [activeId, setActiveId] = useState<string>(() => selected?.collectionId ?? collections[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState<{ s: MaterialSwatch; c: MaterialCollection } | null>(null);
  const active = collections.find(c => c.id === activeId) ?? collections[0];
  const byCat = useMemo(() => { const m = new Map<string, MaterialCollection[]>(); for (const c of collections) m.set(c.category, [...(m.get(c.category) ?? []), c]); return [...m]; }, [collections]);
  const term = q.trim().toLowerCase();
  // ricerca per codice su tutte le collezioni; senza ricerca si mostra solo la collezione attiva
  const results = term ? collections.map(c => ({ c, list: c.swatches.filter(s => (s.code + ' ' + s.name).toLowerCase().includes(term)) })).filter(r => r.list.length) : active ? [{ c: active, list: active.swatches }] : [];
  const tile = (s: MaterialSwatch, c: MaterialCollection) => <button type="button" key={s.id} className={'swatch' + (selected?.id === s.id ? ' chosen' : '')} onClick={() => onSelect(selected?.id === s.id ? null : s)} title={`${c.name} · ${s.name}`}>
    <Img src={swatchSrc(s)} alt={s.name} loading="lazy" />{selected?.id === s.id && <span className="swatchCheck"><Check size={14} /></span>}
    <span className="swatchCode">{s.code}</span>
    <span className="swatchZoom" role="button" aria-label="Ingrandisci" onClick={e => { e.stopPropagation(); setZoom({ s, c }); }}><ZoomIn size={13} /></span>
  </button>;
  return <div className="swatchLibrary">
    <div className="swatchStep"><span>1</span> Scegli il rivestimento</div>
    {byCat.map(([cat, list]) => <div key={cat} className="collectionGroup">
      {byCat.length > 1 && <small className="collectionCat">{cat.toUpperCase()}</small>}
      <div className="collectionTabs" role="tablist">{list.map(c => {
        const on = !term && c.id === active?.id, has = selected?.collectionId === c.id;
        return <button type="button" role="tab" aria-selected={on} key={c.id} className={'collectionTab' + (on ? ' chosen' : '') + (has ? ' hasPick' : '')} onClick={() => { setActiveId(c.id); setQ(''); }}>
          <span className="collectionDots">{c.swatches.slice(0, 5).map(s => <Img key={s.id} src={swatchSrc(s)} alt="" />)}</span>
          <strong>{c.name}</strong><small>{c.swatches.length} colori{has ? ' · scelto' : ''}</small>
        </button>;
      })}</div>
    </div>)}
    <div className="swatchStep"><span>2</span> Scegli il colore{active && !term ? <em> · {active.brand} {active.name}</em> : null}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca codice in tutte le collezioni" aria-label="Cerca campione" /></div>
    {active?.notes && !term && <p className="hint">{active.notes}</p>}
    {results.map(({ c, list }) => <div className="swatchCollection" key={c.id}>
      {term && <div className="swatchHead"><div><small>{c.brand.toUpperCase()} · {c.category.toUpperCase()}</small><strong>{c.name}</strong></div></div>}
      <div className="swatchGrid">{list.map(s => tile(s, c))}</div>
    </div>)}
    {term && !results.length && <p className="hint">Nessun campione con «{q}».</p>}
    {canManage && onDeleteCollection && active && !term && <button type="button" className="linkBtn dangerLink" onClick={() => onDeleteCollection(active)}><Trash2 size={13} /> Elimina la collezione {active.name}</button>}
    {zoom && <div className="modalBackdrop" onClick={() => setZoom(null)}><div className="modal swatchZoomModal" onClick={e => e.stopPropagation()}>
      <div className="modalHeader"><h2>{zoom.c.name} · {zoom.s.code}</h2><button className="iconBtn" onClick={() => setZoom(null)}><X /></button></div>
      <Img src={swatchSrc(zoom.s)} alt={zoom.s.name} />
      <p className="hint">{zoom.c.brand} · {zoom.c.category} · {zoom.s.name}. Il colore a schermo è indicativo: verificare sempre sul campione fisico.</p>
      {!!zoom.s.sources?.length && <p className="hint">Presente nei cataloghi: {zoom.s.sources.map(x => x.catalog).join(' · ')}</p>}
      <div className="actionRow"><button className="btn" onClick={() => { onSelect(zoom.s); setActiveId(zoom.c.id); setZoom(null); }}><Check size={15} /> Scegli questa finitura</button></div>
    </div></div>}
  </div>;
}

type Row = { brand: string; category: string; collection: string; catalog: string; code: string; name: string; file: string };
const IMG = /\.(jpe?g|png|webp)$/i;
/** "920a7b24-Flexform_PELLE_403_24_campioni.zip" → "PELLE 403" */
export const zipCollectionName = (file: string, brand: string) => {
  let n = file.replace(/\.zip$/i, '').replace(/^[0-9a-f]{6,}-/i, '').replace(/[_ -]\d+[_ -]campioni$/i, '');
  if (brand) n = n.replace(new RegExp('^' + brand.replace(/[^\w]/g, '.?') + '[_ -]*', 'i'), '');
  return n.replace(/[_-]+/g, ' ').trim();
};
const pick = (r: Record<string, string>, ...keys: string[]) => keys.map(k => r[k]).find(v => v && v.trim()) ?? '';

async function shrink(data: Uint8Array, type: string): Promise<Blob> {
  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type });
  try {
    const bmp = await createImageBitmap(blob); const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    return await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('conversione')), 'image/jpeg', 0.86));
  } catch { return blob; }
}

/** Import di un campionario: ZIP con foto dei campioni e (facoltativo) materiali.csv / materiali.json
 *  con colonne brand, macrocategoria, collezione, codice, nome, file_immagine. Senza elenco, il codice è il nome del file. */
export function MaterialImport({ defaultBrand, onDone, onClose }: { defaultBrand: string; onDone: (c: MaterialCollection[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [files, setFiles] = useState<Map<string, () => Promise<Uint8Array>>>(new Map());
  const [meta, setMeta] = useState({ brand: defaultBrand, category: 'Pelle', collection: '' });
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState('');
  // con la colonna "catalogo" gli stessi codici in più cataloghi diventano un solo colore (con provenienze), raggruppati per marchio + categoria
  const byCatalog = !!rows?.some(r => r.catalog);
  const colName = (r: Row) => byCatalog ? (r.collection || r.category || meta.category) : (r.collection || meta.collection);
  const groups = useMemo(() => { const g = new Map<string, Row[]>(); for (const r of rows ?? []) { const k = `${r.brand || meta.brand}|${colName(r)}`; g.set(k, [...(g.get(k) ?? []), r]); } return g; }, [rows, meta]);
  const fromList = !!rows?.some(r => r.collection || r.catalog);

  async function load(f: File | undefined) {
    if (!f) return; setError(''); setRows(null);
    try {
      const entries = await readZip(f);
      const map = new Map(entries.filter(e => IMG.test(e.name)).map(e => [e.name.toLowerCase(), e.read]));
      const csv = entries.find(e => /(^|\/)(materiali|materials)\.csv$/i.test(e.name)) || entries.find(e => /\.csv$/i.test(e.name));
      const js = entries.find(e => /(^|\/)(materiali|materials)\.json$/i.test(e.name));
      let list: Record<string, string>[] = [];
      if (js) list = JSON.parse(new TextDecoder().decode(await js.read())).map((o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), String(v ?? '')])));
      else if (csv) list = parseCsv(new TextDecoder().decode(await csv.read()));
      const resolve = (file: string) => { const f = file.toLowerCase().replace(/^\.?\//, ''); if (map.has(f)) return f; const hits = [...map.keys()].filter(k => k.endsWith('/' + f) || (!f.includes('/') && k.split('/').pop() === f)); return hits.length === 1 ? hits[0] : ''; };
      let out: Row[] = list.map(r => { const raw = pick(r, 'codice', 'code'); return { brand: pick(r, 'brand', 'marchio'), category: pick(r, 'macrocategoria', 'categoria', 'category'), collection: pick(r, 'collezione', 'collection'), catalog: pick(r, 'catalogo', 'catalog'), code: raw.match(/(\d[\w-]*)$/)?.[1] ?? raw, name: pick(r, 'nome', 'name') || raw, file: resolve(pick(r, 'file_immagine', 'file', 'immagine', 'image')) }; })
        .filter(r => r.code && r.file);
      if (!out.length) out = [...map.keys()].map(file => { const base = file.split('/').pop()!.replace(IMG, ''); const code = base.match(/(\d[\w-]*)$/)?.[1] ?? base; return { brand: '', category: '', collection: '', catalog: '', code, name: base.replace(/[_-]+/g, ' ').toUpperCase(), file }; });
      if (!out.length) throw new Error('Nessuna immagine di campione trovata nello ZIP');
      out.sort((a, b) => a.code.localeCompare(b.code, 'it', { numeric: true }));
      const first = out[0];
      setMeta(m => ({ brand: first.brand || m.brand, category: (MATERIAL_CATEGORIES as readonly string[]).includes(first.category) ? first.category : m.category, collection: first.collection || zipCollectionName(f.name, first.brand || m.brand) }));
      setFiles(map); setRows(out);
    } catch (e) { setError((e as Error).message); }
  }

  async function run() {
    setError(''); const saved: MaterialCollection[] = [];
    try {
      let n = 0; const total = rows!.length;
      const bySha = new Map<string, string>();
      const typeOf = (f: string) => /png$/i.test(f) ? 'image/png' : /webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
      for (const [, list] of groups) {
        const swatches = [];
        const codes = new Map<string, Row[]>(); for (const r of list) codes.set(r.code, [...(codes.get(r.code) ?? []), r]);
        for (const [code, rs] of codes) {
          // foto di riferimento: dal catalogo che porta lo stesso codice, altrimenti la prima; le altre restano come provenienze
          const ref = rs.find(r => r.catalog.endsWith(' ' + code)) ?? rs[0];
          const sources = [];
          let refBytes: Uint8Array | null = null;
          for (const r of rs) {
            setProgress(`Caricamento foto ${++n} di ${total}…`);
            const bytes = await files.get(r.file)!();
            if (r === ref) refBytes = bytes;
            if (!byCatalog) continue;
            const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))].map(b => b.toString(16).padStart(2, '0')).join('');
            if (!bySha.has(sha)) bySha.set(sha, (await upload(new File([bytes as Uint8Array<ArrayBuffer>], r.file.split('/').pop()!, { type: typeOf(r.file) }))).id);
            sources.push({ catalog: r.catalog, fileId: bySha.get(sha), sha256: sha });
          }
          const blob = await shrink(refBytes!, typeOf(ref.file));
          const f = await upload(new File([blob], `${code}.jpg`, { type: blob.type || 'image/jpeg' }));
          swatches.push({ code, name: ref.name || code, fileId: f.id, sources });
        }
        const r0 = list[0];
        const res = await post<{ collection: MaterialCollection }>('/api/materials/collections', { brand: r0.brand || meta.brand, category: fromList && (MATERIAL_CATEGORIES as readonly string[]).includes(r0.category) ? r0.category : meta.category, name: colName(r0), swatches });
        saved.push(res.collection);
      }
      onDone(saved);
    } catch (e) { setError(e instanceof ApiError ? e.message : (e as Error).message); setProgress(''); }
  }

  return <div className="modalBackdrop" onClick={() => !progress && onClose()}><div className="modal wide" onClick={e => e.stopPropagation()}>
    <div className="modalHeader"><h2>Importa campionario</h2><button className="iconBtn" onClick={onClose} disabled={!!progress}><X /></button></div>
    <p className="hint">ZIP con le foto dei campioni. Se contiene <strong>materiali.csv</strong> o <strong>materials.csv</strong> (brand, categoria, collezione o catalogo, codice, nome, file) marchio, collezione e codici vengono letti da lì; con la colonna catalogo i codici ripetuti in più cataloghi diventano un solo colore; altrimenti il codice è il nome del file. Importando di nuovo la stessa collezione, i campioni vengono aggiornati.</p>
    <label className="btn secondary fileBtn"><Archive size={15} /> Scegli file ZIP<input type="file" accept=".zip,application/zip" hidden onChange={e => { load(e.target.files?.[0]); e.target.value = ''; }} /></label>
    {rows && <>
      {!fromList && <div className="inlineFields">
        <label className="field"><span>Marchio</span><input value={meta.brand} onChange={e => setMeta({ ...meta, brand: e.target.value })} /></label>
        <label className="field"><span>Collezione</span><input value={meta.collection} onChange={e => setMeta({ ...meta, collection: e.target.value })} /></label>
      </div>}
      {!fromList && <label className="field"><span>Categoria</span><select value={meta.category} onChange={e => setMeta({ ...meta, category: e.target.value })}>{MATERIAL_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>}
      {[...groups].map(([k, list]) => { const codes = [...new Set(list.map(r => r.code))]; const cats = [...new Set(list.map(r => r.catalog).filter(Boolean))];
        return <p key={k} className="importSummary"><strong>{list[0].brand || meta.brand} · {colName(list[0])}</strong> — {codes.length} colori ({codes.slice(0, 8).join(', ')}{codes.length > 8 ? '…' : ''}){cats.length ? <><br /><small>{list.length} foto da {cats.length} cataloghi ({cats.join(', ')}): ogni codice compare una volta sola, le foto dei cataloghi restano come provenienza.</small></> : null}</p>; })}
      {progress && <><span className="scanProgress" /><p className="hint">{progress}</p></>}
      <div className="actionRow"><button className="btn" disabled={!!progress || (!fromList && (!meta.brand.trim() || !meta.collection.trim()))} onClick={run}>Importa {new Set(rows.map(r => `${r.brand}|${colName(r)}|${r.code}`)).size} colori</button></div>
    </>}
    {error && <p className="formError">{error}</p>}
  </div></div>;
}

export async function deleteCollection(c: MaterialCollection) { await del(`/api/materials/collections/${c.id}`); }
