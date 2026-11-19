// "In breve" without AI: facts from the page's structured data, its most
// informative sentences, and why it matters from the person's collections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDigest, keySentences, whyItMatters, structuredFacts, jsonLd, markedPoints } from '../digest.mjs';

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
  assert.equal(whyItMatters({ kind: 'cook', title: 'Spaghetti alla carbonara, la ricetta', interests: ['Posti da provare', 'Idee', 'Ricette'] }), 'Va con la tua raccolta «Ricette». Da cucinare.');
  assert.equal(whyItMatters({ kind: 'read', title: 'Una storia di posti e idee', interests: ['Posti da provare', 'Idee'] }), 'Da leggere con calma.');
});

test('events, products and articles', () => {
  const ev = structuredFacts(jsonLd(`<script type="application/ld+json">{"@type":"MusicEvent","startDate":"2027-05-14T21:00","location":{"name":"Teatro Verdi","address":{"addressLocality":"Firenze"}},"offers":{"price":"25","priceCurrency":"EUR"}}</script>`));
  assert.deepEqual(ev, { kind: 'event', facts: ['Quando: 14 maggio 2027, ore 21:00', 'Dove: Teatro Verdi, Firenze', 'Biglietti da 25 €'] });
  const pr = structuredFacts(jsonLd(`<script type="application/ld+json">{"@graph":[{"@type":"Product","brand":{"name":"Tod's"},"offers":{"price":"590.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}]}</script>`));
  assert.deepEqual(pr, { kind: 'buy', facts: ['Marca: Tod\'s', 'Prezzo: 590,00 €'] });
  const ar = structuredFacts(jsonLd(`<script type="application/ld+json">{"@type":"NewsArticle","author":[{"name":"Redazione"}],"datePublished":"2026-11-16T08:00:00Z"}</script>`));
  assert.deepEqual(ar, { kind: 'read', facts: ['Pubblicato il 16 novembre 2026, ore 08:00'] });
  const wiki = structuredFacts(jsonLd(`<script type="application/ld+json">{"@type":"Article","author":{"name":"Contributori ai progetti Wikimedia"},"datePublished":"2006-02-09"}</script>`));
  assert.deepEqual(wiki, { kind: 'read', facts: [] }, 'no meaningless page-creation date');
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
  assert.deepEqual([reel.points, reel.why], [['🛹 Diego Poncelet', 'Con: Prada', 'Dove: Red Bull España'], 'Da guardare.']);
  const cut = makeDigest({ url: 'https://www.facebook.com/reel/2/', html: '', title: 'Mark Zuckerberg, co-founder and CEO of Meta, says he only hires people he…',
    description: 'Mark Zuckerberg, co-founder and CEO of Meta, says he only hires people he could imagine working for himself. Zuckerberg asks whether he would willingly join their company if the roles were reversed.' });
  assert.match(cut.points[0], /could imagine working for himself/);
  const same = makeDigest({ html: '', title: 'Il nuovo ponte sul fiume è stato inaugurato oggi in città', description: 'Il nuovo ponte sul fiume è stato inaugurato oggi in città con una festa.' });
  assert.equal(same, null, 'nothing beyond the title: the note stays as it is');
});

const article = `<html><head><title>x</title></head><body>
<nav><ul><li><strong>Abbonati ora</strong> a soli 1 euro al mese per leggere tutto</li></ul></nav>
<h1>La legge di bilancio cambierà ancora</h1>
<h2 class="article-subtitle">Come ogni anno il governo corregge quel che aveva promesso: soprattutto scuola, banche e pensioni</h2>
<div class="article-body">
<p>Il testo arriverà in aula la prossima settimana dopo un lungo esame in commissione al Senato.</p>
<p>Nella prima versione erano previsti <strong>tagli per 4.925 posti di docenti</strong> a partire dall'anno scolastico 2027/2028, poi ridotti.</p>
<p><b>Le pensioni</b> Il governo ha rinviato di un anno l'aumento dell'età per la pensione anticipata. Altre frasi seguono qui.</p>
<p>Un paragrafo qualunque senza nulla di particolare da segnalare, scritto solo per riempire la pagina di testo.</p>
<p>Per accedere senza limiti a tutti i contenuti <strong>abbonati al nostro giornale</strong> oggi stesso.</p>
</div><aside><h2>Leggi anche</h2><p><strong>Un altro articolo del tutto diverso che parla di calcio e di mercato</strong></p></aside>
</body></html>`;

test('what the author marked: the summary, sentences with bold words, bold labels with what follows', () => {
  const p = markedPoints(article, { skip: ['La legge di bilancio cambierà ancora'] });
  assert.equal(p[0], 'Come ogni anno il governo corregge quel che aveva promesso: soprattutto scuola, banche e pensioni');
  assert.ok(p.includes("Nella prima versione erano previsti tagli per 4.925 posti di docenti a partire dall'anno scolastico 2027/2028, poi ridotti."), 'the whole sentence around the bold words');
  assert.ok(p.includes("Le pensioni: Il governo ha rinviato di un anno l'aumento dell'età per la pensione anticipata."), 'a bold label heads its paragraph');
  assert.ok(!p.some(x => /abbonati|calcio/i.test(x)), 'no paywall, no related articles');
});

test('Wikipedia-style: the bold term opens the definition', () => {
  const html = `<h1>Bistecca alla fiorentina</h1><div class="mw-parser-output"><div class="mw-content-text"><p>La <b>bistecca alla fiorentina</b> è un taglio di carne di vitellone o di scottona, di razza Chianina, cotto sulla brace. È uno dei piatti più noti della cucina toscana.</p>${'<p>Altro testo della voce che continua per un bel po\' di righe senza grassetti né segni particolari di alcun tipo.</p>'.repeat(4)}</div></div>`;
  const p = markedPoints(html, { skip: ['Bistecca alla fiorentina - Wikipedia'] });
  assert.equal(p[0], 'La bistecca alla fiorentina è un taglio di carne di vitellone o di scottona, di razza Chianina, cotto sulla brace.');
});

import { compact } from '../digest.mjs';
test('points are whole sentences: no cuts, no ellipsis, no open quotes', () => {
  assert.equal(compact('L’Ue vara un prestito da 45 miliardi per Kiev, 25 in aiuti mil…'), '', 'cut by the site: left out');
  assert.equal(compact('Il governo ha previsto una riduzione di 4.925 posti per i docenti, e di 2.049 posti per il personale ATA, cioè i funzionari tecnici e amministrativi delle scuole, con un risparmio stimato di molte centinaia di milioni di euro nei prossimi tre anni scolastici a venire'),
    'Il governo ha previsto una riduzione di 4.925 posti per i docenti', 'shortened only where a clause ends');
  assert.equal(compact('Così definisce il taglio della bistecca: « Bistecca alla fiorentina'), '', 'open quote: split in the wrong place');
  assert.equal(compact('La spesa per i farmaci: Nel 2025 è cresciuta del 4 per cento.'), 'La spesa per i farmaci: nel 2025 è cresciuta del 4 per cento');
  const long = 'Una frase lunghissima senza alcuna pausa naturale che continua a parlare di argomenti diversi uno dopo l’altro senza mai fermarsi né usare congiunzioni utili a trovare un punto di taglio sensato per chi la legge in fretta sul telefono durante la giornata lavorativa';
  assert.equal(compact(long), '', 'no clean place to shorten it: left out rather than cut');
});
