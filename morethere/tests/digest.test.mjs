// "In breve" without AI: facts from the page's structured data, its most
// informative sentences, and why it matters from the person's collections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDigest, keySentences, whyItMatters, structuredFacts, jsonLd } from '../digest.mjs';

const restaurant = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Trattoria da Mario', servesCuisine: ['Lombarda', 'Milanese'],
  address: { streetAddress: 'Via Solferino 12', addressLocality: 'Milano' }, priceRange: '€€', telephone: '+39 02 123456',
  aggregateRating: { ratingValue: 4.6, reviewCount: 812 },
})}</script></head><body><nav>Home Menu Contatti</nav>
<p>Dal 1962 la Trattoria da Mario serve a Milano la cucina lombarda di casa, con il risotto giallo e la cotoletta come piatti simbolo.</p>
<p>Il locale ha quaranta coperti e un piccolo giardino interno aperto da maggio a settembre, da prenotare con qualche giorno di anticipo.</p>
<p>Accetta cookie e privacy policy per continuare la navigazione sul nostro sito web e ricevere la newsletter.</p></body></html>`;

test('a restaurant: cuisine, address, prices and rating from its structured data', () => {
  const d = makeDigest({ html: restaurant, title: 'Trattoria da Mario — Milano', interests: ['Idee', 'Posti da provare', 'Milano'] });
  assert.ok(d.points.some(p => p === 'Cucina: Lombarda, Milanese'));
  assert.ok(d.points.some(p => p === 'Indirizzo: Via Solferino 12, Milano'));
  assert.ok(d.points.some(p => /^Dal 1962 la Trattoria da Mario/.test(p)), 'the most telling sentence of the page');
  assert.ok(!d.points.some(p => /cookie|newsletter/i.test(p)), 'no cookie banners');
  assert.ok(d.points.length <= 4);
  assert.equal(d.why, 'Va con la tua raccolta «Milano». Un posto da provare.');
});

test('vague collection names never decide the match', () => {
  assert.equal(whyItMatters({ kind: 'cook', text: 'Spaghetti alla carbonara, la ricetta', interests: ['Posti da provare', 'Idee', 'Ricette'] }), 'Va con la tua raccolta «Ricette». Da cucinare.');
  assert.equal(whyItMatters({ kind: 'read', text: 'Una storia di posti e idee', interests: ['Posti da provare', 'Idee'] }), 'Da leggere con calma.');
});

test('events, products and articles', () => {
  const ev = structuredFacts(jsonLd(`<script type="application/ld+json">{"@type":"MusicEvent","startDate":"2027-05-14T21:00","location":{"name":"Teatro Verdi","address":{"addressLocality":"Firenze"}},"offers":{"price":"25","priceCurrency":"EUR"}}</script>`));
  assert.deepEqual(ev, { kind: 'event', facts: ['Quando: 14 maggio 2027, ore 21:00', 'Dove: Teatro Verdi, Firenze', 'Biglietti da 25 €'] });
  const pr = structuredFacts(jsonLd(`<script type="application/ld+json">{"@graph":[{"@type":"Product","brand":{"name":"Tod's"},"offers":{"price":"590.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}]}</script>`));
  assert.deepEqual(pr, { kind: 'buy', facts: ['Marca: Tod\'s', 'Prezzo: 590,00 €'] });
  const ar = structuredFacts(jsonLd(`<script type="application/ld+json">{"@type":"NewsArticle","author":[{"name":"Contributori di Wikimedia"}],"datePublished":"2026-11-16T08:00:00Z"}</script>`));
  assert.deepEqual(ar, { kind: 'read', facts: ['Pubblicato il 16 novembre 2026, ore 08:00'] });
});

test('key sentences: informative, not repeating the title, in page order', () => {
  const text = 'Benvenuti. ' + 'Il Ponte Vecchio di Firenze fu costruito nel 1345 dopo una piena dell’Arno che distrusse il ponte precedente. '
    + 'Ospita dal 1593 le botteghe degli orafi, volute dal granduca Ferdinando I al posto dei macellai. '
    + 'È uno dei simboli più fotografati della città e si attraversa a piedi in pochi minuti.';
  const s = keySentences(text, { max: 2, skip: ['Ponte Vecchio'] });
  assert.equal(s.length, 2);
  assert.ok(s.every(x => x.length >= 40));
  assert.ok(text.indexOf(s[0]) < text.indexOf(s[1]), 'kept in the order of the page');
});

test('an empty page gives no digest', () => {
  assert.equal(makeDigest({ html: '<html><body>Ciao</body></html>', title: 'x' }), null);
});

test('social posts: emoji labels become facts, the title is not repeated, a cut title is completed', () => {
  const reel = makeDigest({ url: 'https://www.facebook.com/reel/1/', html: '', title: '🚨 SPEED RECORD ALERT: 151.83 km/h on a skateboard 🚨',
    description: '🚨 SPEED RECORD ALERT: 151.83 km/h on a skateboard 🚨 🛹: Diego Poncelet 🤝: Prada 📍: Red Bull España' });
  assert.deepEqual(reel, { points: ['🛹 Diego Poncelet', 'Con: Prada', 'Dove: Red Bull España'], why: 'Da guardare.' });
  const cut = makeDigest({ url: 'https://www.facebook.com/reel/2/', html: '', title: 'Mark Zuckerberg, co-founder and CEO of Meta, says he only hires people he…',
    description: 'Mark Zuckerberg, co-founder and CEO of Meta, says he only hires people he could imagine working for himself. Zuckerberg asks whether he would willingly join their company if the roles were reversed.' });
  assert.match(cut.points[0], /could imagine working for himself/);
  const same = makeDigest({ html: '', title: 'Il nuovo ponte sul fiume è stato inaugurato oggi in città', description: 'Il nuovo ponte sul fiume è stato inaugurato oggi in città con una festa.' });
  assert.equal(same, null, 'nothing beyond the title: the note stays as it is');
});
