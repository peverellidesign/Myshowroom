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
    const authors = asArray(article.author).map(str);
    const author = authors.filter(a => a && !/contribut|wikimedia|redazione|staff|admin/i.test(a)).slice(0, 2).join(' e ');
    // A wiki page's "date" is when the page was created: meaningless here.
    const when = authors.some(a => /contribut|wikimedia/i.test(a)) ? '' : itDate(article.datePublished);
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

const fold = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---- 2. the most informative sentences -------------------------------------------
const STOP = new Set(('il lo la i gli le un uno una di a da in con su per tra fra e ed o ma se che chi cui non più come anche già solo del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono era erano essere ha hanno ho abbiamo questo questa questi queste quello quella quelli quelle suo sua suoi sue loro mio mia nostro nostra ci si mi ti vi ne c è stato stata fa fare molto tutto tutti ogni dove quando perché quindi poi così ancora sempre mai oltre dopo prima the a an and or but of to in on for with at by from is are was were be been has have had this that these those it its as not no so than then too very can will just our your their we you they he she his her them us my me i about into over more most some such only own same other also all any each few both out up down off again further once here there why how what which who whom').split(' '));
const words = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]{3,}/g) || [];
const NOISE = /cookie|privacy|newsletter|iscriviti|abbonati|abbonamento|accedi|accedere|login|registrati|tutti i diritti|copyright|seguici|condividi|leggi anche|pubblicit|subscribe|sign in|all rights reserved|javascript|wikisource|wikimedia|commons contiene|contiene una pagina|contiene immagini|portale\s/i;

export function keySentences(text, { max = 3, skip = [] } = {}) {
  // A sentence that opens with the title keeps only what it adds.
  const heads = skip.map(t => t.replace(/[…\s]+$/, '').trim()).filter(t => t.length >= 20);
  const trimHead = s => { const h = heads.find(t => s.startsWith(t) && s.length - t.length >= 40); return h ? s.slice(h.length).replace(/^[\s:,.;\-–—]+/, '') : s; };
  const sentences = text.replace(/\s*\n\s*/g, '\n').split(/(?<=[.!?…])\s+|\n+/)
    .map(s => trimHead(s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()))
    .filter((s, i, all) => i < all.length - 1 || /[.!?…"”»)]$/.test(s) || !/[a-zà-ÿ]$/i.test(s)) // drop a last sentence cut mid-word
    .filter(s => s.length >= 40 && s.length <= 260 && words(s).length >= 6 && !NOISE.test(s));
  if (!sentences.length) return [];
  const freq = new Map();
  for (const s of sentences) for (const w of new Set(words(s))) if (!STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  const seenWords = new Set(skip.flatMap(words));
  // A shortened title ("…") is completed by its sentence, so that one stays.
  const starts = skip.filter(t => !/…\s*$/.test(t)).map(t => fold(t).slice(0, 60)).filter(t => t.length >= 20);
  const scored = sentences.map((s, i) => {
    const ws = words(s).filter(w => !STOP.has(w));
    let score = ws.reduce((a, w) => a + Math.log(1 + (freq.get(w) || 0)), 0) / Math.sqrt(ws.length || 1);
    if (/\d/.test(s)) score *= 1.25; // dates, prices, figures
    if (/\s[A-ZÀ-Ý][a-zà-ÿ]+/.test(s.slice(1))) score *= 1.1; // names, places
    score *= 1 + 0.6 / (1 + i / 3); // early sentences carry the point
    const overlap = ws.filter(w => seenWords.has(w)).length / (ws.length || 1);
    if (overlap > 0.7 || starts.some(t => fold(s).startsWith(t))) score = -1; // already said by the title
    return { s, i, score };
  }).sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of scored) {
    if (c.score < 0) continue;
    const ws = new Set(words(c.s));
    if (chosen.some(o => { const ow = new Set(words(o.s)); return [...ws].filter(w => ow.has(w)).length / Math.min(ws.size, ow.size) > 0.6; })) continue;
    chosen.push(c);
    if (chosen.length === max) break;
  }
  return chosen.sort((a, b) => a.i - b.i).map(c => (c.s.length > 200 ? `${c.s.slice(0, 197).replace(/\s+\S*$/, '')}…` : c.s));
}

// ---- 2b. what the author marked as important --------------------------------------
// Writers flag the key passages themselves: the summary under the headline
// (sommario, occhiello), sentences with words in bold, the subheadings of the
// article and its short lists. Only the body of the article counts: menus,
// "leggi anche", paywall and cookie banners are left out.
// Tags may carry quoted attributes containing ">" (Wikipedia does): skip them whole.
const TAG = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const tagText = h => decodeEntities(h.replace(/<(sup|style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(TAG, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const BLOCK = /<\/?(div|article|section|main)\b[^>]*>/gi;
// The element that holds the article: articleBody, <article>, or a body-like class;
// the one with the most paragraph text wins.
export function articleBody(html) {
  const starts = [];
  const re = /<(div|article|section|main)\b[^>]*(itemprop\s*=\s*["']articleBody["']|class\s*=\s*["'][^"']*\b(article[-_]?body|articleBody|entry-content|post-content|post__content|story-body|news-txt|single-content|article-content|article__body|content-body|mw-parser-output|testo|corpo)\b[^"']*["'])[^>]*>|<(article|main)\b[^>]*>/gi;
  for (const m of html.matchAll(re)) starts.push(m.index);
  let best = ''; let bestScore = 0;
  for (const start of starts.slice(0, 40)) {
    BLOCK.lastIndex = start; let depth = 0; let end = html.length; let t;
    while ((t = BLOCK.exec(html))) { depth += t[0][1] === '/' ? -1 : 1; if (depth === 0) { end = t.index + t[0].length; break; } }
    const part = html.slice(start, end);
    const score = [...part.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].reduce((a, m) => a + tagText(m[1]).length, 0);
    if (score > bestScore) { bestScore = score; best = part; }
  }
  return bestScore >= 300 ? best : '';
}

const firstSentence = t => (t.match(/^(.{30,}?[.!?…])(\s|$)/)?.[1] || t).slice(0, 220);
const sentenceAround = (text, piece) => {
  const at = text.indexOf(piece); if (at < 0) return '';
  const from = Math.max(0, ...['. ', '! ', '? '].map(p => text.lastIndexOf(p, at)).filter(i => i >= 0).map(i => i + 2));
  const stop = text.slice(at + piece.length).search(/[.!?…](\s|$)/);
  return text.slice(from, stop < 0 ? text.length : at + piece.length + stop + 1).trim();
};
const tidy = s => (s.length > 220 ? `${s.slice(0, 217).replace(/\s+\S*$/, '')}…` : s);

export function markedPoints(html, { skip = [] } = {}) {
  const found = []; // { text, weight, pos }
  const add = (text, weight, pos) => {
    const t = tidy(text.replace(/\s+/g, ' ').trim());
    if (t.length < 25 || words(t).length < 5 || NOISE.test(t)) return;
    found.push({ text: t, weight, pos });
  };
  // Summary right under the headline, by class name or as the first heading/paragraph after <h1>.
  const h1 = html.search(/<h1\b/i);
  const near = h1 >= 0 ? html.slice(h1, h1 + 6000) : '';
  const byClass = html.match(/<(p|h2|div|span)\b[^>]*class\s*=\s*["'][^"']*\b(summary|sommario|occhiello|catenaccio|excerpt|subtitle|sottotitolo|standfirst|abstract|lead|dek|intro|article-description|post-excerpt)\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i)?.[3];
  const after = near.match(/<\/h1>[\s\S]{0,1500}?<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/i);
  // A subheading right under the title is the summary; a first paragraph gives its first sentence.
  const summary = byClass ? tagText(byClass) : after ? (after[1].toLowerCase() === 'h2' ? tagText(after[2]) : firstSentence(tagText(after[2]))) : '';
  if (summary) add(summary, 10, -1);

  const body = articleBody(html);
  if (body) {
    // Photo captions are not part of the story.
    const story = body.replace(/<(figure|figcaption|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(p|span|div)\b[^>]*class\s*=\s*["'][^"']*(caption|didascalia|credit)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const paras = [...story.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    paras.forEach((m, i) => {
      const inner = m[2]; const text = tagText(inner);
      if (text.length < 20) return;
      const bolds = [...inner.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(b => tagText(b[2])).filter(b => b.length >= 4);
      for (const b of bolds) {
        // A short bold label opening the paragraph ("La spesa per i farmaci") heads what follows.
        if (text.startsWith(b) && words(b).length <= 8) add(`${b.replace(/[:.\s]+$/, '')}: ${firstSentence(text.slice(b.length).replace(/^[\s:.\-–—]+/, ''))}`, 6 + Math.min(b.length, 60) / 30, i);
        else add(b.length >= 60 ? b : sentenceAround(text, b), 6 + Math.min(b.length, 60) / 30, i);
      }
      if (m[1].toLowerCase() === 'li' && paras.filter(x => x[1].toLowerCase() === 'li').length <= 8) add(text, 3, i);
    });
    // Subheadings with the first sentence that follows them.
    for (const h of body.matchAll(/<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>\s*(?:<[^p][^>]*>\s*)*<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const head = tagText(h[2]); const next = firstSentence(tagText(h[3]));
      if (head.length >= 4 && next) add(`${head.replace(/[:.\s]+$/, '')}: ${next}`, 4, h.index);
    }
  }
  // Wikipedia and many guides: the bold term opens the first paragraph, which is the definition.
  if (!found.some(f => f.weight >= 6) && body) {
    const lead = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => m[1]).find(p => /<(b|strong)\b/i.test(p.slice(0, 300)) && tagText(p).length > 60);
    if (lead) add(firstSentence(tagText(lead)), 7, 0);
  }
  // Drop what the title already says and near-duplicates; best first, then page order.
  const seen = skip.map(t => new Set(words(t)));
  const out = [];
  for (const f of found.sort((a, b) => b.weight - a.weight)) {
    const ws = new Set(words(f.text));
    const same = set => [...ws].filter(w => set.has(w)).length / Math.max(1, Math.min(ws.size, set.size));
    if (seen.some(set => same(set) > 0.8)) continue;
    if (out.some(o => same(new Set(words(o.text))) > 0.6)) continue;
    out.push(f);
    if (out.length === 3) break;
  }
  return out.sort((a, b) => a.pos - b.pos).map(f => f.text);
}

// ---- social captions -------------------------------------------------------------
// Posts often label facts with emoji: "🛹: Diego Poncelet 🤝: Prada 📍: Red Bull España".
const EMOJI_LABELS = [[/📍|🗺|🏠|🏢/u, 'Dove'], [/📅|🗓|⏰|🕒/u, 'Quando'], [/🤝/u, 'Con'], [/🎥|🎬|📹/u, 'Video'], [/📸|📷/u, 'Foto'], [/🎵|🎶|🎧/u, 'Musica'], [/👤|🧑|👨|👩/u, 'Chi'], [/💰|💶|💲|🏷/u, 'Prezzo'], [/🔗/u, 'Link']];
export function captionFacts(text) {
  const facts = [];
  const re = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*[:：]\s*([^\p{Extended_Pictographic}\n|]{2,80})/gu;
  for (const [, emoji, value] of text.matchAll(re)) {
    const v = value.trim().replace(/[\s,;.\-–]+$/, '');
    if (!v) continue;
    const label = EMOJI_LABELS.find(([r]) => r.test(emoji))?.[1];
    facts.push(label ? `${label}: ${v}` : `${emoji} ${v}`);
  }
  const tags = [...new Set([...text.matchAll(/#([\p{L}\p{N}_]{3,30})/gu)].map(m => m[1]))].slice(0, 4);
  if (tags.length) facts.push(`Temi: ${tags.map(t => `#${t}`).join(' ')}`);
  return facts.slice(0, 4);
}

// ---- 3. compact points ------------------------------------------------------------
// A point fits in about a line and a half: drop asides in brackets, then cut at a
// clause boundary (comma, semicolon, dash) rather than mid-sentence; never mid-word.
export function compact(s, max = 150) {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  t = t.replace(/\s*[-–—|]\s*(Notizie|News|Ansa\.it|Il Post|Corriere|la Repubblica)[^.]*$/i, '');
  // Text the site itself cut ("aiuti mil…"): drop the broken word, keep the ellipsis.
  let cut = false;
  if (/…$/.test(t)) { t = t.slice(0, -1).replace(/\s+\S*$/, ''); cut = true; }
  if (t.length > max) t = t.replace(/\s*\([^)]{3,80}\)/g, '');
  if (t.length > max) {
    const head = t.slice(0, max);
    const at = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(' – '), head.lastIndexOf(' - '));
    // A clause boundary late enough to keep the meaning; otherwise a word boundary.
    if (at >= 95) { t = head.slice(0, at); cut = true; } else { t = head.replace(/\s+\S*$/, ''); cut = true; }
  }
  t = t.replace(/[\s,;:.]+$/, '');
  if (cut) t = t.replace(/\s+(che|e|ed|o|di|da|del|della|dei|delle|con|per|a|al|alla|in|su|il|la|lo|i|gli|le|un|una|the|and|of|to|a)$/i, '') + '…';
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

// The editor's own summary (description) is usually the best mini-summary of
// a news story: split it into its sentences, short ones included.
export function summarySentences(description, title = '') {
  const d = decodeEntities(decodeEntities(description || '')).replace(/\s+/g, ' ').trim();
  if (!d) return [];
  const tw = new Set(words(title));
  return d.split(/(?<=[.!?;])\s+(?=[A-ZÀ-ÝÈÉ0-9«"“'])/)
    .map(x => x.trim())
    .filter(x => words(x).length >= 2 && x.length >= 10 && !NOISE.test(x) && !/^—\s/.test(x))
    .filter(x => { const ws = words(x); return ws.filter(w => tw.has(w)).length / Math.max(1, ws.length) < 0.75; })
    .filter(x => !/^\p{Extended_Pictographic}/u.test(x) || words(x).length >= 4);
}

// ---- 4. why it matters ------------------------------------------------------------
const WHY = {
  eat: 'Un posto da provare.', stay: 'Un posto dove dormire, da tenere per il prossimo viaggio.', visit: 'Da visitare.',
  shop: 'Un negozio da ricordare.', buy: 'Da tenere d\'occhio se ti interessa.', event: 'Segnati la data.', cook: 'Da cucinare.',
  read: 'Da leggere con calma.', watch: 'Da guardare.', '': 'Da ritrovare quando ti serve.',
};
// Words in collection names that say nothing about the subject.
const VAGUE = new Set('posti posto cose cosa idee idea provare vedere fare leggere varie vario altro altre preferiti salvati salvate miei mie nuovi nuove belle bello ispirazione ispirazioni lista liste raccolta tutto stuff things ideas places'.split(' '));
export function whyItMatters({ kind, title = '', points = [], interests = [], when, section = '' }) {
  // A collection goes with the page only when its words are in the title (or, for
  // names of two words or more, in the points too): "viaggio" in a news story
  // about a president's trip is not your "Viaggi".
  const inTitle = fold(title); const inPoints = fold(points.join(' '));
  let match = ''; let best = 0;
  for (const name of interests) {
    const ws = words(name).filter(w => !STOP.has(w) && !VAGUE.has(w) && w.length >= 4);
    if (!ws.length) continue;
    const re = w => new RegExp(`\\b${w.length > 5 ? w.slice(0, -1) : w}`);
    const hitsTitle = ws.filter(w => re(w).test(inTitle)).length;
    const hitsAll = ws.filter(w => re(w).test(inTitle) || re(w).test(inPoints)).length;
    const ok = hitsTitle >= 1 && hitsAll / ws.length >= 0.5;
    if (ok && hitsAll > best) { best = hitsAll; match = name; }
  }
  const base = kind === 'event' && when ? `Segnati la data: ${when}.` : kind === 'read' && section ? `Da leggere: ${section}.` : WHY[kind] ?? WHY[''];
  return match ? `Va con la tua raccolta «${match}». ${base}` : base;
}

const sectionOf = (nodes, html) => {
  const s = nodes.map(n => asArray(n.articleSection)[0]).find(Boolean) || metaContent(html, ['article:section']);
  const t = str(s);
  return t && t.length <= 30 && !/^https?:/.test(t) && !/^(notizie|news|home|ultima ora|ultim[ae] notizie|articol[oi]|blog|post|corporate news|generale|varie)$/i.test(t) ? t : '';
};
const overlap = (a, b) => { const A = new Set(words(a).filter(w => !STOP.has(w))); const B = [...new Set(words(b).filter(w => !STOP.has(w)))]; return B.filter(w => A.has(w)).length / Math.max(1, Math.min(A.size, B.length)); };

// A point that mostly says what the title says (most of its words are in the title).
const repeats = (title, t) => { const A = new Set(words(title).filter(w => !STOP.has(w))); const B = [...new Set(words(t).filter(w => !STOP.has(w)))]; return B.length > 0 && B.filter(w => A.has(w)).length / B.length > 0.7; };

// ---- all together -------------------------------------------------------------------
export function makeDigest({ html = '', title = '', description = '', interests = [], url = '' }) {
  const nodes = jsonLd(html);
  const s = structuredFacts(nodes);
  const m = s.facts.length ? { facts: [], kind: '' } : metaFacts(html);
  const kind = s.kind || m.kind || (/\/(reel|reels|videos?|watch|shorts)\b|youtu\.be|tiktok\.com|vimeo\.com|\/share\/[vr]\//i.test(url) ? 'watch' : '');
  const caption = description.replace(/(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*[:：]\s*[^\p{Extended_Pictographic}\n|]{2,80}/gu, ' ').replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const captionLabels = captionFacts([title, description].join('\n'));
  // Places, products, events and recipes: their facts are the point. News and the
  // rest: the story first; author and date only when there is nothing else.
  const hardFacts = [...s.facts.filter(f => !/^(Di |Pubblicato)/.test(f)), ...m.facts.filter(f => !/^(Di |Pubblicato)/.test(f)), ...captionLabels];
  const byline = [...s.facts, ...m.facts].filter(f => /^(Di |Pubblicato)/.test(f));

  const editor = summarySentences(caption, title);
  const candidates = [
    ...editor,
    ...markedPoints(html, { skip: [title] }),
    ...keySentences([caption, htmlText(html)].filter(Boolean).join('\n'), { max: 3, skip: [title] }),
  ];
  // The editor's summary is protected for stories; for places, products and events the
  // structured facts already cover it, so a richer sentence from the page may replace it.
  const story = []; const fixed = new Set(hardFacts.length ? [] : editor.map(e => compact(e)));
  for (const c of candidates) {
    const t = compact(c);
    if (t.length < 8 || repeats(title, t)) continue;
    // Same thing said twice: keep the richer wording.
    const twin = story.findIndex(o => overlap(o, t) > 0.6);
    // (The editor's own summary stays: it is written to be short.)
    if (twin >= 0) { if (!fixed.has(story[twin]) && !/…$/.test(t) && t.length > story[twin].length * 1.5 && words(t).length > words(story[twin]).length + 3) story[twin] = t; continue; }
    story.push(t);
  }
  const room = hardFacts.length ? Math.max(1, 4 - hardFacts.length) : 3;
  let points = [...story.slice(0, room), ...hardFacts].slice(0, 4);
  if (points.length < 2) points = [...points, ...byline].slice(0, 3);
  const when = hardFacts.find(f => f.startsWith('Quando: '))?.slice(8);
  return points.length ? { points, why: whyItMatters({ kind, title, points, interests, when, section: sectionOf(nodes, html) }), kind } : null;
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
    const d = makeDigest({ html: page.html, title: String(body.title || '').slice(0, 300), description: String(body.description || '').slice(0, 3000), interests, url });
    return d ? json(res, 200, d) : json(res, 422, { error: 'no_digest' });
  } catch {
    return json(res, 502, { error: 'unavailable' });
  }
}
export function handleDigestStatus(_req, res) { json(res, 200, { enabled: true }); }
