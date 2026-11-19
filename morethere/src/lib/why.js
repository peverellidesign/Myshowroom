// "Perché ti interessa", argued from what morethere knows about you — no AI.
//
// Runs on the device, on your own data: what you save and when, how you file
// it, the interests in your profile, the advice you asked for, the spaces you
// share and what friends opened to you. Each signal that applies gets a score;
// the two strongest become sentences, followed by what to do with it.

const STOP = new Set(('il lo la i gli le un uno una di a da in con su per tra fra e ed o ma se che chi cui non più come anche già solo del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono era essere ha hanno questo questa questi queste quello quella suo sua loro ci si mi ti vi ne stato stata fa fare molto tutto tutti ogni dove quando perché quindi poi così ancora sempre mai dopo prima oggi ieri domani anno anni volta volte nuovo nuova nuovi nuove grande prima primo the a an and or but of to in on for with at by from is are was were be has have this that it as not no so than can will just our your their we you they he she his her about into over more most some only other also all any new post video foto pagine notizie news facebook instagram reel ecco come cosa cose fatto fatti parte modo tempo giorno giorni mese mesi milioni miliardi euro dollari ceo presidente').split(' '));
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const wordsOf = s => (fold(s).match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w));
// Proper names: capitalised words (people, brands, places), the strongest clue.
export const namesIn = text => new Set((String(text || '').match(/\b\p{Lu}[\p{L}\p{N}'’.-]{2,}/gu) || [])
  .map(w => fold(w).replace(/[’'.-]+$/, '')).filter(w => w.length >= 4 && !STOP.has(w)));
// Topic words: names plus longer content words, singular and plural folded together.
const stem = w => (w.length > 6 ? w.slice(0, -1) : w);
export const termsIn = text => new Set([...namesIn(text), ...wordsOf(text).filter(w => w.length >= 6)].map(stem));

const fmtDay = d => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const ORD = ['', 'prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava', 'nona', 'decima'];
const nth = n => (n < ORD.length ? ORD[n] : `${n}ª`);
const short = (t, n = 48) => (t.length > n ? `${t.slice(0, n - 3).replace(/\s+\S*$/, '')}…` : t);
const pretty = w => w.replace(/^\p{L}/u, c => c.toUpperCase());

// Families of interests, so "Food" in a profile recognises a trattoria.
const FAMILIES = [
  { names: ['food', 'cibo', 'cucina', 'ristoranti', 'gastronomia', 'mangiare', 'vino', 'wine'], kinds: ['eat', 'cook'], words: ['ristorant', 'trattoria', 'osteria', 'cucina', 'ricett', 'chef', 'pizza', 'gelat', 'vino', 'cantina', 'piatto', 'menu', 'food', 'restaurant', 'recipe'] },
  { names: ['travel', 'viaggi', 'viaggio', 'viaggiare', 'trip', 'turismo'], kinds: ['stay', 'visit'], words: ['viaggi', 'hotel', 'volo', 'voli', 'spiaggia', 'isola', 'museo', 'itinerari', 'weekend', 'travel', 'trip', 'resort', 'b&b'] },
  { names: ['architecture', 'architettura', 'design', 'interior', 'interni', 'arredamento', 'casa'], kinds: [], words: ['architett', 'design', 'mobili', 'arred', 'interni', 'lampad', 'furniture', 'mid-century', 'midcentury', 'progett', 'edifici', 'villa'] },
  { names: ['tech', 'tecnologia', 'technology', 'ai', 'innovazione', 'startup'], kinds: [], words: ['tecnolog', 'nvidia', 'apple', 'google', 'microsoft', 'chip', 'software', 'startup', 'intelligenza artificiale', 'smartphone', 'tech'] },
  { names: ['finance', 'finanza', 'economia', 'business', 'investimenti', 'borsa'], kinds: [], words: ['borsa', 'fatturat', 'utile', 'ricavi', 'mercat', 'azion', 'investiment', 'banca', 'banche', 'economi', 'finanz'] },
  { names: ['arte', 'art', 'mostre', 'cultura', 'musei'], kinds: ['visit'], words: ['mostra', 'museo', 'artista', 'galleria', 'opera', 'pittura', 'scultura', 'arte'] },
  { names: ['sport', 'fitness', 'running', 'calcio', 'bici'], kinds: [], words: ['sport', 'partita', 'record', 'atleta', 'allenament', 'corsa', 'skateboard', 'calcio', 'tennis', 'bici'] },
  { names: ['moda', 'fashion', 'style', 'stile'], kinds: ['shop', 'buy'], words: ['moda', 'fashion', 'collezione', 'stilista', 'abito', 'scarpe', 'mocassin', 'brand'] },
  { names: ['music', 'musica', 'concerti'], kinds: ['event'], words: ['concerto', 'album', 'canzone', 'musica', 'band', 'cantante', 'tour'] },
];

/**
 * @param item      the discovery being summarised ({ id, title, url, collection })
 * @param points    its key points
 * @param kind      what it is (eat, read, watch, buy, event…), from the server
 * @param base      what to do with it ("Da leggere con calma."), from the server
 * @param fallback  the server's own why, used when nothing personal applies
 * @param me        { items, collections, profile, asks, spaces, received, now }
 */
export function buildWhy({ item, points = [], kind = '', base = '', fallback = '', me = {} }) {
  const { items = [], profile = null, asks = [], spaces = [], received = [], now = Date.now() } = me;
  const text = [item.title, ...points].join(' ');
  const names = namesIn(text);
  const terms = termsIn(text);
  const others = items.filter(i => i.id !== item.id);
  const signals = []; // { score, text }

  // 1. A subject you keep coming back to: the name (or topic) most of your saves share.
  const seen = new Map();
  for (const o of others) {
    const theirs = termsIn(`${o.title} ${o.note || ''}`);
    for (const t of terms) if (theirs.has(t)) { const list = seen.get(t) || []; list.push(o); seen.set(t, list); }
  }
  const byName = [...seen.entries()].filter(([t]) => [...names].some(n => stem(n) === t));
  const best = (byName.length ? byName : [...seen.entries()]).sort((a, b) => b[1].length - a[1].length)[0];
  if (best && best[1].length >= 1 && (byName.length || best[1].length >= 2)) {
    const [term, list] = best;
    const label = pretty([...names].find(n => stem(n) === term) || term);
    const latest = list.reduce((a, b) => (b.created > a.created ? b : a));
    const count = list.length + 1;
    signals.push(count >= 3
      ? { score: 6 + count, text: `È la ${nth(count)} cosa che salvi su ${label}: è un tema che segui (l'ultima il ${fmtDay(latest.created)}).` }
      : { score: 6, text: `Si collega a «${short(latest.title)}», che hai salvato il ${fmtDay(latest.created)}.` });
  }

  // 2. Where it belongs: the collection holding most discoveries like this one
  // (at least two). The default inbox ("Idee") says nothing, so it is skipped.
  const fit = new Map();
  for (const o of others) {
    if (!o.collection || /^(idee|inbox|da vedere|varie)$/i.test(o.collection)) continue;
    const shared = [...termsIn(`${o.title} ${o.note || ''}`)].filter(t => terms.has(t)).length;
    if (shared) fit.set(o.collection, (fit.get(o.collection) || 0) + 1);
  }
  const home = [...fit.entries()].sort((a, b) => b[1] - a[1])[0];
  if (home && home[1] >= 2 && home[0] !== item.collection) {
    signals.push({ score: 4 + Math.min(home[1], 4), text: `Starebbe bene in «${home[0]}», dove hai già ${home[1]} scoperte simili.` });
  }

  // 3. The interests you wrote in your profile ("Travel · Food · Architecture").
  const declared = (profile?.subtitle || '').split(/[·,|/•]+/).map(s => s.trim()).filter(Boolean);
  const body = fold(text);
  for (const interest of declared) {
    const key = fold(interest);
    const family = FAMILIES.find(f => f.names.includes(key));
    const hit = family ? (family.kinds.includes(kind) || family.words.some(w => body.includes(w))) : body.includes(key);
    if (hit) { signals.push({ score: 5, text: `Rientra in ${interest}, uno degli interessi che hai scritto nel profilo.` }); break; }
  }

  // 4. Advice you asked your friends for: this may be the answer.
  for (const a of asks) {
    const place = a.place ? fold(a.place) : '';
    const askTerms = termsIn(a.title);
    if ((place && body.includes(place)) || [...askTerms].some(t => terms.has(t) && t.length >= 5)) {
      signals.push({ score: 12, text: `Ti sarà utile per «${short(a.title, 40)}»: è la richiesta che hai fatto ai tuoi amici il ${fmtDay(a.created_at)}.` });
      break;
    }
  }

  // 5. A shared space where it would fit, and who you would share it with.
  for (const s of spaces) {
    if (s.myStatus && s.myStatus !== 'active') continue;
    const spaceTerms = termsIn(`${s.name} ${(s.titles || []).join(' ')}`);
    if ([...spaceTerms].some(t => terms.has(t) && t.length >= 5)) {
      const who = (s.others || []).filter(m => m.status === 'active').map(m => (m.profile?.display_name || '').split(' ')[0]).filter(Boolean);
      signals.push({ score: 7, text: `Potresti aggiungerlo a «${short(s.name, 40)}»${who.length ? `, lo spazio che condividi con ${who.slice(0, 2).join(' e ')}` : ''}.` });
      break;
    }
  }

  // 6. A friend who already opened something similar to you.
  for (const r of received) {
    const t = r.item?.title || r.item_title || '';
    if ([...namesIn(t)].some(n => names.has(n))) {
      const friend = (r.sender?.display_name || 'Un amico').split(' ')[0];
      signals.push({ score: 6, text: `${friend} ti aveva aperto qualcosa di simile: «${short(t, 40)}».` });
      break;
    }
  }

  const chosen = signals.sort((a, b) => b.score - a.score).slice(0, 2).map(s => s.text);
  if (!chosen.length) return fallback || base;
  return [...chosen, base].filter(Boolean).join(' ');
}
