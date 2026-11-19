// "Ti interessa perché…": the discovery's theme meets one of yours. No AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interestReason, themeOf, themesOf } from '../src/lib/interests.js';

const saves = [
  { id: '1', title: 'Nvidia supera 100 miliardi di ricavi e batte le attese', note: 'Fatturato di 115 miliardi di dollari' },
  { id: '2', title: 'Ipo da record di Anthropic', note: 'Prezzo a 83 dollari per azione, ricavi per 376 milioni di dollari' },
  { id: '3', title: 'La legge di bilancio cambierà ancora', note: 'Il governo corregge la manovra su banche e pensioni' },
  { id: '4', title: 'Como-Cagliari, probabili formazioni', note: 'Serie A, stadio Sinigaglia' },
];

test('themes: a match is sport, results are economy and technology at once', () => {
  assert.equal(themeOf('Como-Cagliari: il Como non ha mai perso in Serie A allo stadio').id, 'sport');
  assert.deepEqual(themesOf('Nvidia e i chip: ricavi record, fatturato di 115 miliardi di dollari').sort(), ['economy', 'tech']);
  assert.equal(themeOf("Il ritorno in campo dell'attaccante slitta ancora").id, 'sport', 'apostrophes do not hide words');
});

test('you follow economy: an article on historic shops is for you', () => {
  const text = 'Regione premia 32 nuove attività storiche della provincia di Como. Il marchio va a negozi e botteghe attivi da almeno 40 anni';
  assert.equal(interestReason({ text, items: saves }), 'Segui spesso i temi economici.');
  assert.equal(interestReason({ text: 'Il Como vince in Serie A', items: saves }), 'Ti stai avvicinando allo sport.');
  assert.equal(interestReason({ text: 'Una nuova mostra di pittura alla Triennale', items: saves }), '', 'not a theme of yours: nothing claimed');
  assert.equal(interestReason({ text: 'Una nuova mostra di pittura alla Triennale', items: saves, profile: { subtitle: 'Arte · Viaggi' } }), 'Hai indicato l’arte e la cultura tra i tuoi interessi.');
});
