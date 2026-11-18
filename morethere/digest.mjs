// "In breve" without AI: POST /api/digest { url, title, description, interests[] }
//   -> { points: string[], why: string }
//
// Everything is worked out here, with rules, from the page itself:
//   1. structured data the site publishes for search engines (schema.org
//      JSON-LD and og: tags): a restaurant's cuisine and address, a product's
//      price, an article's author and date, an event's date and place…
//   2. the most informative sentences of the text (extractive summary: words
//      that recur, numbers, names; the page's own sentences, never rewritten);
//   3. "why it matters" from the person's collection names and the kind of
//      content.
// Nothing leaves our server except the request to the page itself.

import { pageHtml, htmlText, metaContent, decodeEntities, userFromRequest } from './preview.mjs';

// ---- 1. structured data -------------------------------------------------------
const asArray = v => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = v => (typeof v === 'string' ? decodeEntities(v).trim() : typeof v === 'number' ? String(v) : v?.name ? str(v.name) : '');
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function itDate(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return '';
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[4] && !(m[4] === '00' && m[5] === '00') ? `${day}, ore ${m[4]}:${m[5]}` : day;
}
const address = a => (typeof a === 'string' ? a : [a?.streetAddress, a?.addressLocality].map(str).filter(Boolean).join(', '));
const money = (price, cur) => (price ? `${String(price).replace('.', ',')}${cur === 'EUR' || !cur ? ' €' : ` ${cur}`}` : '');

export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      for (const node of asArray(data).flatMap(d => (d?.['@graph'] ? asArray(d['@graph']) : [d]))) if (node && typeof node === 'object') out.push(node);
    } catch { /* broken JSON-LD: skip */ }
  }
  return out;
}
const typeOf = n => asArray(n['@type']).map(String).join(' ');

// The node that describes the page, and what kind of thing it is.
export function structuredFacts(nodes) {
  const pick = re => nodes.find(n => re.test(typeOf(n)));
  const place = pick(/Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|Winery|IceCreamShop|Hotel|LodgingBusiness|TouristAttraction|Museum|Store|LocalBusiness/);
  const event = pick(/Event/);
  const product = pick(/Product/);
  const recipe = pick(/Recipe/);
  const article = pick(/NewsArticle|Article|BlogPosting|Report/);
  const video = pick(/VideoObject/);
  const facts = []; let kind = '';
  const rating = r => (r?.ratingValue ? `Valutazione ${String(r.ratingValue).replace('.', ',')}${r.bestRating ? `/${r.bestRating}` : '/5'}${r.reviewCount || r.ratingCount ? ` (${r.reviewCount || r.ratingCount} recensioni)` : ''}` : '');
  if (place) {
    const t = typeOf(place);
    kind = /Hotel|Lodging/.test(t) ? 'stay' : /Museum|TouristAttraction/.test(t) ? 'visit' : /Store/.test(t) ? 'shop' : /Restaurant|Food|Cafe|Bar|Bakery|Winery|IceCream/.test(t) ? 'eat' : '';
    const cuisine = asArray(place.servesCuisine).map(str).filter(Boolean).join(', ');
    if (cuisine) facts.push(`Cucina: ${cuisine}`);
    const where = address(place.address); if (where) facts.push(`Indirizzo: ${where}`);
    if (place.priceRange) facts.push(`Prezzi: ${str(place.priceRange)}`);
    const r = rating(place.aggregateRating); if (r) facts.push(r);
    if (place.telephone && kind) facts.push(`Telefono: ${str(place.telephone)}`);
  } else if (event) {
    kind = 'event';
    const when = itDate(event.startDate); if (when) facts.push(`Quando: ${when}`);
    const loc = asArray(event.location)[0]; const where = [str(loc), address(loc?.address)].filter(Boolean).join(', ');
    if (where) facts.push(`Dove: ${where}`);
    const offer = asArray(event.offers)[0]; const p = money(offer?.price, offer?.priceCurrency); if (p) facts.push(`Biglietti da ${p}`);
  } else if (recipe) {
    kind = 'cook';
    const time = String(recipe.totalTime || recipe.cookTime || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (time && (time[1] || time[2])) facts.push(`Tempo: ${[time[1] && `${time[1]} h`, time[2] && `${time[2]} min`].filter(Boolean).join(' ')}`);
    if (recipe.recipeYield) facts.push(`Dosi: ${str(asArray(recipe.recipeYield)[0])}`);
    const n = asArray(recipe.recipeIngredient).length; if (n) facts.push(`${n} ingredienti`);
  } else if (product) {
    kind = 'buy';
    const brand = str(product.brand); if (brand) facts.push(`Marca: ${brand}`);
    const offer = asArray(product.offers)[0]; const p = money(offer?.price ?? offer?.lowPrice, offer?.priceCurrency); if (p) facts.push(`Prezzo: ${p}`);
    if (/OutOfStock|SoldOut/i.test(String(offer?.availability || ''))) facts.push('Al momento non disponibile');
    const r = rating(product.aggregateRating); if (r) facts.push(r);
  } else if (article) {
    kind = 'read';
    const author = asArray(article.author).map(str).filter(a => a && !/contribut|wikimedia|redazione|staff|admin/i.test(a)).slice(0, 2).join(' e ');
    const when = itDate(article.datePublished);
    if (author || when) facts.push([author && `Di ${author}`, when && `pubblicato il ${when}`].filter(Boolean).join(', '));
  } else if (video) {
    kind = 'watch';
    const dur = String(video.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (dur && (dur[1] || dur[2])) facts.push(`Durata: ${[dur[1] && `${dur[1]} h`, dur[2] && `${dur[2]} min`].filter(Boolean).join(' ')}`);
  }
  return { facts: facts.map(f => (f[0].toUpperCase() + f.slice(1)).slice(0, 140)), kind };
}

// og: and article: tags, for pages without JSON-LD.
export function metaFacts(html) {
  const facts = []; let kind = '';
  const type = metaContent(html, ['og:type']);
  const price = metaContent(html, ['product:price:amount', 'og:price:amount']);
  if (price) { kind = 'buy'; facts.push(`Prezzo: ${money(price, metaContent(html, ['product:price:currency', 'og:price:currency']))}`); }
  const published = metaContent(html, ['article:published_time']);
  const author = metaContent(html, ['article:author', 'author']);
  if (/article/i.test(type) || published) {
    kind = kind || 'read';
    const when = itDate(published);
    if ((author && !/^https?:/.test(author)) || when) facts.push([author && !/^https?:/.test(author) && `Di ${author}`, when && `pubblicato il ${when}`].filter(Boolean).join(', '));
  }
  if (/video/i.test(type)) kind = kind || 'watch';
  return { facts: facts.map(f => f[0].toUpperCase() + f.slice(1)), kind };
}

// ---- 2. the most informative sentences -------------------------------------------
const STOP = new Set(('il lo la i gli le un uno una di a da in con su per tra fra e ed o ma se che chi cui non più come anche già solo del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono era erano essere ha hanno ho abbiamo questo questa questi queste quello quella quelli quelle suo sua suoi sue loro mio mia nostro nostra ci si mi ti vi ne c è stato stata fa fare molto tutto tutti ogni dove quando perché quindi poi così ancora sempre mai oltre dopo prima the a an and or but of to in on for with at by from is are was were be been has have had this that these those it its as not no so than then too very can will just our your their we you they he she his her them us my me i about into over more most some such only own same other also all any each few both out up down off again further once here there why how what which who whom').split(' '));
const words = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) || [];
const NOISE = /cookie|privacy|newsletter|iscriviti|abbonati|accedi|login|registrati|tutti i diritti|copyright|seguici|condividi|leggi anche|pubblicit|subscribe|sign in|all rights reserved|javascript/i;

export function keySentences(text, { max = 3, skip = [] } = {}) {
  const sentences = text.replace(/\s*\n\s*/g, '\n').split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 40 && s.length <= 260 && words(s).length >= 6 && !NOISE.test(s));
  if (!sentences.length) return [];
  const freq = new Map();
  for (const s of sentences) for (const w of new Set(words(s))) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const seenWords = new Set(skip.flatMap(words));
  const scored = sentences.map((s, i) => {
    const ws = words(s).filter(w => !STOP.has(w));
    let score = ws.reduce((a, w) => a + Math.log(1 + (freq.get(w) || 0)), 0) / Math.sqrt(ws.length || 1);
    if (/\d/.test(s)) score *= 1.25; // dates, prices, figures
    if (/\s[A-ZÀ-Ý][a-zà-ÿ]+/.test(s.slice(1))) score *= 1.1; // names, places
    score *= 1 + 0.6 / (1 + i / 3); // early sentences carry the point
    const overlap = ws.filter(w => seenWords.has(w)).length / (ws.length || 1);
    if (overlap > 0.7) score *= 0.3; // already said by the title
    return { s, i, score };
  }).sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of scored) {
    const ws = new Set(words(c.s));
    if (chosen.some(o => { const ow = new Set(words(o.s)); return [...ws].filter(w => ow.has(w)).length / Math.min(ws.size, ow.size) > 0.6; })) continue;
    chosen.push(c);
    if (chosen.length === max) break;
  }
  return chosen.sort((a, b) => a.i - b.i).map(c => (c.s.length > 200 ? `${c.s.slice(0, 197).replace(/\s+\S*$/, '')}…` : c.s));
}

// ---- 3. why it matters ------------------------------------------------------------
const WHY = {
  eat: 'Un posto da provare.', stay: 'Un posto dove dormire, da tenere per il prossimo viaggio.', visit: 'Da visitare.',
  shop: 'Un negozio da ricordare.', buy: 'Da tenere d\'occhio se ti interessa.', event: 'Segnati la data.', cook: 'Da cucinare.',
  read: 'Da leggere con calma.', watch: 'Da guardare.', '': 'Da ritrovare quando ti serve.',
};
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Words in collection names that say nothing about the subject.
const VAGUE = new Set('posti posto cose cosa idee idea provare vedere fare leggere varie vario altro altre preferiti salvati salvate miei mie nuovi nuove belle bello ispirazione ispirazioni lista liste raccolta tutto stuff things ideas places'.split(' '));
export function whyItMatters({ kind, text, interests = [], when }) {
  const t = fold(text);
  // The collection whose own words (singular or plural) appear most in the page.
  let match = ''; let best = 0;
  for (const name of interests) {
    const ws = words(name).filter(w => !STOP.has(w) && !VAGUE.has(w) && w.length >= 4);
    const hits = ws.filter(w => new RegExp(`\\b${w.length > 5 ? w.slice(0, -1) : w}`).test(t)).length;
    if (hits && hits / ws.length >= 0.5 && hits > best) { best = hits; match = name; }
  }
  const base = kind === 'event' && when ? `Segnati la data: ${when}.` : WHY[kind] ?? WHY[''];
  return match ? `Va con la tua raccolta «${match}». ${base}` : base;
}

// ---- all together -------------------------------------------------------------------
export function makeDigest({ html = '', title = '', description = '', interests = [] }) {
  const s = structuredFacts(jsonLd(html));
  const m = s.facts.length ? { facts: [], kind: '' } : metaFacts(html);
  const facts = [...s.facts, ...m.facts];
  const kind = s.kind || m.kind;
  const text = [description, htmlText(html)].filter(Boolean).join('\n');
  const sentences = keySentences(text, { max: facts.length >= 3 ? 1 : 3 - Math.min(facts.length, 1), skip: [title] });
  const points = [...sentences, ...facts].slice(0, 4);
  const when = facts.find(f => f.startsWith('Quando: '))?.slice(8);
  return points.length ? { points, why: whyItMatters({ kind, text: [title, text].join(' '), interests, when }) } : null;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
async function readBody(req, max = 8192) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error('too_large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const hits = new Map();
function limited(userId) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter(t => t > now - 600_000);
  list.push(now); hits.set(userId, list);
  return list.length > 60;
}

export async function handleDigest(req, res) {
  try {
    const userId = await userFromRequest(req);
    if (!userId) return json(res, 401, { error: 'unauthorized' });
    if (limited(userId)) return json(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    const url = String(body.url || '');
    if (!/^https?:\/\//i.test(url) || url.length > 2048) return json(res, 400, { error: 'bad_url' });
    const interests = (Array.isArray(body.interests) ? body.interests : []).map(String).map(s => s.slice(0, 60)).slice(0, 30);
    const page = await pageHtml(url).catch(() => ({ html: '' }));
    const d = makeDigest({ html: page.html, title: String(body.title || '').slice(0, 300), description: String(body.description || '').slice(0, 3000), interests });
    return d ? json(res, 200, d) : json(res, 422, { error: 'no_digest' });
  } catch {
    return json(res, 502, { error: 'unavailable' });
  }
}
export function handleDigestStatus(_req, res) { json(res, 200, { enabled: true }); }
