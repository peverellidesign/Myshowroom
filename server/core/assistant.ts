// "Ask myshowroom": ricerca sull'inventario reale. Nessun dato inventato:
// la risposta è costruita solo dai record del database. Se è configurato un modello
// linguistico, questo riceve esclusivamente i record trovati e può solo riformularli.
import type { AssistantAnswer, DocumentRecord, Product } from '../../shared/types';
import type { LanguageModel } from './deps';

const STOP = new Set('abbiamo avete quali quale quanti quante sono sono che cosa dove del della dello delle degli dei nel nella nei nelle con per tra fra una uno gli le la il lo di da in su mi ci si ho hai ha prodotti prodotto presenti presente mostra mostrami trova cerca tutti tutte qualche elenco the and of in at for show me what which'.split(' '));
const SYN: Record<string, string[]> = {
  sedute: ['sedia', 'sedie', 'divano', 'divani', 'poltrona', 'poltrone', 'seduta', 'sofa'],
  tavoli: ['tavolo', 'tavola', 'table', 'dining'],
  tavolini: ['tavolino', 'coffee'],
  contenitori: ['contenitore', 'madia', 'credenza', 'libreria', 'cabinet', 'armadio'],
  letti: ['letto', 'bed'],
  illuminazione: ['lampada', 'lampade', 'luce', 'luci', 'lampadario'],
  esposto: ['esposizione', 'esposti', 'esposte', 'esposta', 'vetrina'],
  disponibile: ['disponibili', 'stock', 'libero', 'liberi'],
  riservato: ['riservati', 'riservata', 'riserva', 'prenotato', 'bloccato'],
  venduto: ['venduti', 'venduta'],
  magazzino: ['deposito', 'magazzini'],
  milano: ['brera'],
  catalogo: ['cataloghi', 'pdf', 'documento', 'documenti', 'scheda', 'schede', 'listino'],
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function expandQuery(q: string): string[][] {
  const words = norm(q).split(/[^a-z0-9&]+/).filter(w => w.length > 1 && !STOP.has(w));
  return words.map(w => {
    const alts = new Set([w]);
    for (const [k, vs] of Object.entries(SYN)) if (k === w || vs.includes(w)) { alts.add(k); vs.forEach(v => alts.add(v)); }
    if (w.length > 4) alts.add(w.slice(0, -1)); // plurale/singolare semplice
    return [...alts];
  });
}

export function searchInventory(q: string, products: (Product & { liveStatus: string })[], docs: DocumentRecord[]) {
  const groups = expandQuery(q);
  const wantsDocs = groups.some(g => g.includes('catalogo'));
  const scored = products.map(p => {
    const hay = norm([p.brand, p.name, p.category, p.location, p.zone, p.liveStatus, p.materials.join(' '), p.colors.join(' '), p.description].join(' '));
    let score = 0, matched = 0;
    for (const g of groups) {
      if (g.includes('catalogo')) continue;
      const hit = g.some(t => hay.includes(t));
      if (hit) { matched++; score += g.some(t => norm(p.brand + ' ' + p.name).includes(t)) ? 3 : 1; }
    }
    return { p, score, matched };
  });
  const relevantGroups = groups.filter(g => !g.includes('catalogo')).length;
  // tutti i termini devono corrispondere (AND); se nessun risultato, si accettano corrispondenze parziali
  let hits = scored.filter(s => relevantGroups > 0 && s.matched === relevantGroups);
  let partial = false;
  if (!hits.length) { hits = scored.filter(s => s.matched > 0); partial = hits.length > 0; }
  hits.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  const productIds = hits.slice(0, 12).map(h => h.p.id);
  const docHits = docs.filter(d => {
    if (d.productIds.some(id => productIds.includes(id))) return wantsDocs || productIds.length <= 3;
    const hay = norm(d.name + ' ' + d.type);
    return groups.some(g => !g.includes('catalogo') && g.some(t => hay.includes(t)));
  });
  return { productIds, documentIds: docHits.slice(0, 8).map(d => d.id), partial };
}

export function localAnswer(found: ReturnType<typeof searchInventory>, products: (Product & { liveStatus: string })[]): string {
  const ps = found.productIds.map(id => products.find(p => p.id === id)!).filter(Boolean);
  if (!ps.length) return found.documentIds.length ? `Nessun prodotto corrisponde, ma ho trovato ${found.documentIds.length} documenti pertinenti.` : 'Nessun prodotto in inventario corrisponde alla richiesta.';
  const bySite = new Map<string, number>();
  ps.forEach(p => bySite.set(p.location, (bySite.get(p.location) || 0) + 1));
  const sites = [...bySite].map(([s, n]) => `${n} a ${s}`).join(', ');
  const head = found.partial ? `Nessuna corrispondenza esatta; ${ps.length === 1 ? 'il prodotto più vicino' : `i ${ps.length} prodotti più vicini`}` : `Ho trovato ${ps.length} ${ps.length === 1 ? 'prodotto' : 'prodotti'}`;
  return `${head} (${sites}).` + (found.documentIds.length ? ` ${found.documentIds.length} documenti collegati.` : '');
}

export async function ask(q: string, products: (Product & { liveStatus: string })[], docs: DocumentRecord[], llm: LanguageModel | null): Promise<AssistantAnswer> {
  const found = searchInventory(q, products, docs);
  const base = localAnswer(found, products);
  if (!llm) return { answer: base, productIds: found.productIds, documentIds: found.documentIds, mode: 'local' };
  const facts = found.productIds.map(id => products.find(p => p.id === id)!).map(p =>
    `- ${p.brand} ${p.name} | categoria ${p.category} | sede ${p.location} (${p.zone}) | stato ${p.liveStatus} | ${p.dims} | ${p.currency} ${p.price} | materiali ${p.materials.join(', ')} | colori ${p.colors.join(', ')}`).join('\n');
  try {
    const answer = await llm.complete(
      'Sei l’assistente interno di myshowroom by Peverelli Design. Rispondi in italiano, in modo breve ed elegante. Usa ESCLUSIVAMENTE i dati forniti; se mancano, dillo. Non inventare disponibilità, prezzi o finiture.',
      `Domanda del consulente: ${q}\n\nRecord verificati dall’inventario:\n${facts || '(nessun record trovato)'}`);
    return { answer: answer.trim() || base, productIds: found.productIds, documentIds: found.documentIds, mode: 'llm' };
  } catch (e) {
    console.warn('[assistant] modello non raggiungibile, uso risposta locale', e);
    return { answer: base, productIds: found.productIds, documentIds: found.documentIds, mode: 'local' };
  }
}
