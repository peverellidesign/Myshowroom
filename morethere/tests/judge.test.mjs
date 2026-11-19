// "Perché ti interessa" as a judgment, without AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../src/lib/judge.js';

test('news: which way the facts point, only for the subject, and what changed since your last saves', () => {
  const before = ['Nvidia supera per la prima volta 100 miliardi di ricavi e batte le attese.', 'Fatturato di 115,84 miliardi di dollari, in aumento del 103%', 'La Sec indaga dopo le dimissioni del ceo Jensen Huang'];
  const now = { title: 'Ipo da record di Anthropic mentre Nvidia segna la peggior serie di ribassi dal 2008', points: ['Anthropic ha fissato il prezzo della sua IPO da record a 83 dollari per azione, mentre Nvidia va verso la settima perdita settimanale e Washington limita l’export di chip per l’IA'] };
  const nvidia = judge({ subject: 'Nvidia', sector: 'semiconduttori', kind: 'read', ...now, before, follows: 3 });
  assert.equal(nvidia, 'Il quadro su Nvidia sta cambiando: dopo attese superate, ora un titolo in calo e nuove restrizioni. Per chi, come te, lo segue da vicino, è un passaggio da non perdere.');
  assert.ok(!/record|Borsa/.test(nvidia), "Anthropic's record IPO is not Nvidia's");
  const anthropic = judge({ subject: 'Anthropic', sector: 'intelligenza artificiale', kind: 'read', ...now });
  assert.equal(anthropic, "Anthropic è in una fase favorevole: risultati record e un debutto in Borsa. È un segnale da tenere d'occhio per chi si interessa di intelligenza artificiale.");
  const mixed = judge({ subject: 'Nvidia', sector: 'semiconduttori', kind: 'read', title: 'Nvidia supera per la prima volta 100 miliardi di ricavi e batte le attese.', points: ['Fatturato in aumento del 103%', 'La Sec indaga dopo le dimissioni del ceo Jensen Huang'], follows: 2 });
  assert.match(mixed, /^Nvidia vive una fase contrastata: attese superate e conti in forte crescita, ma anche un cambio al vertice e un'indagine in corso\./);
});

test('places, products, events and recipes are judged on their data', () => {
  assert.equal(judge({ kind: 'eat', points: ['Cucina: Lombarda', 'Indirizzo: Via Solferino 12, Milano', 'Valutazione 4,6/5 (812 recensioni)'] }),
    'Un indirizzo di cucina lombarda molto apprezzato a Milano: vale la deviazione la prossima volta che ci passi.');
  assert.match(judge({ kind: 'buy', points: ['Marca: Tod\'s', 'Prezzo: 590,00 €'] }), /^Un pezzo di Tod's da 590,00 €: da valutare con calma/);
  assert.equal(judge({ kind: 'cook', points: ['Tempo: 25 min'] }), 'Una ricetta da 25 min: alla portata di una sera qualunque.');
});

test('nothing sound to say: no judgment', () => {
  assert.equal(judge({ subject: 'Meteo', kind: 'read', title: 'Previsioni per il fine settimana', points: ['Sole al nord, nuvole al centro'] }), '');
});

test('words that only look like signals do not count', () => {
  assert.equal(judge({ subject: 'Trump', kind: 'read', title: 'Trump in Cina, abbraccio con Xi e stretta di mano con Putin.', points: ['Domani il vertice tra i presidenti di Usa, Russia e Repubblica Popolare Cinese'] }), '', 'a handshake is not a restriction');
});
