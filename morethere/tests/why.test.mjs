// "Perché ti interessa" from what morethere knows about you, without AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhy } from '../src/lib/why.js';

const day = d => Date.parse(`2026-11-${String(d).padStart(2, '0')}T10:00:00Z`);
const items = [
  { id: 'a', title: 'Ran into NVIDIA CEO Jensen Huang on a NYC street…', note: '— Adam Glyn su Facebook', created: day(18), collection: 'Idee' },
  { id: 'b', title: 'Nvidia e il boom dei chip per l’intelligenza artificiale', note: '', created: day(10), collection: 'Tech' },
  { id: 'c', title: 'Apple presenta il nuovo chip M6', note: '', created: day(5), collection: 'Tech' },
  { id: 'd', title: 'Trattoria Sostanza, Firenze', note: '• Cucina: Toscana', created: day(2), collection: 'Firenze' },
  { id: 'e', title: 'Gelateria dei Neri a Firenze', note: '', created: day(3), collection: 'Firenze' },
  { id: 'f', title: 'Lampada Arco di Castiglioni', note: '• Design mid-century', created: day(4), collection: 'Design' },
];
const me = (extra = {}) => ({ items, profile: { subtitle: 'Travel · Food · Architecture' }, asks: [], spaces: [], received: [], ...extra });

test('a subject you follow: counts your saves about it', () => {
  const why = buildWhy({ item: { id: 'new', title: 'Nvidia supera per la prima volta 100 miliardi di ricavi' }, points: ['La Sec indaga dopo le dimissioni del ceo Jensen Huang'], kind: 'read', base: 'Da leggere con calma.', me: me() });
  assert.match(why, /^È la terza cosa che salvi su Nvidia: è un tema che segui \(l'ultima il 18 nov\)\./);
  assert.ok(!/«Idee»/.test(why), 'the default inbox is not a suggestion');
  assert.match(why, /Da leggere con calma\.$/);
});

test('your profile interests, your request for advice, your shared spaces', () => {
  const asks = [{ title: 'Firenze, a maggio', place: 'Firenze', created_at: '2026-11-12T09:00:00Z' }];
  const spaces = [{ name: 'Weekend a Firenze', myStatus: 'active', others: [{ status: 'active', profile: { display_name: 'Federica Lombardi' } }] }];
  const why = buildWhy({ item: { id: 'new', title: 'Osteria del Cinghiale Bianco, Firenze' }, points: ['Cucina: Toscana'], kind: 'eat', base: 'Un posto da provare.', me: me({ asks, spaces }) });
  assert.match(why, /^Ti sarà utile per «Firenze, a maggio»: è la richiesta che hai fatto ai tuoi amici il 12 nov\./);
  assert.match(why, /È la terza cosa che salvi su Firenze|Potresti aggiungerlo a «Weekend a Firenze», lo spazio che condividi con Federica/);
  const onlySpace = buildWhy({ item: { id: 'x', title: 'Weekend a Firenze: dove dormire' }, kind: 'stay', base: 'Da tenere per il prossimo viaggio.', me: me({ items: [], spaces, profile: null }) });
  assert.equal(onlySpace, 'Potresti aggiungerlo a «Weekend a Firenze», lo spazio che condividi con Federica. Da tenere per il prossimo viaggio.');
  assert.match(why, /Un posto da provare\.$/);
  const food = buildWhy({ item: { id: 'n2', title: 'Ricetta del ragù bolognese' }, points: ['Tempo: 3 h'], kind: 'cook', base: 'Da cucinare.', me: me({ items: [] }) });
  assert.equal(food, 'Rientra in Food, uno degli interessi che hai scritto nel profilo. Da cucinare.');
});

test('a friend already opened something similar', () => {
  const received = [{ sender: { display_name: 'Luca Bianchi' }, item: { title: 'Castiglioni e il design italiano' } }];
  const why = buildWhy({ item: { id: 'n', title: 'Mostra su Castiglioni alla Triennale' }, kind: 'event', base: 'Segnati la data.', me: me({ received, profile: null }) });
  assert.match(why, /Luca ti aveva aperto qualcosa di simile: «Castiglioni e il design italiano»\./);
});

test('nothing personal applies: the server sentence stays', () => {
  const why = buildWhy({ item: { id: 'n', title: 'Previsioni meteo per il fine settimana' }, kind: 'read', base: 'Da leggere con calma.', fallback: 'Da leggere con calma.', me: me({ profile: null }) });
  assert.equal(why, 'Da leggere con calma.');
});

test('the collection that already holds similar discoveries', () => {
  const tech = [
    { id: 't1', title: 'Processori e semiconduttori nel 2026', created: day(8), collection: 'Tech' },
    { id: 't2', title: 'La crisi dei semiconduttori in Europa', created: day(9), collection: 'Tech' },
  ];
  const why = buildWhy({ item: { id: 'n', title: 'I semiconduttori tornano a crescere' }, kind: 'read', base: 'Da leggere con calma.', me: me({ items: tech, profile: null }) });
  assert.match(why, /È la terza cosa che salvi su Semiconduttori/);
  assert.match(why, /Starebbe bene in «Tech», dove hai già 2 scoperte simili\./);
});

test('the same link saved again, and interests worked out from what you save', () => {
  const saved = [{ id: 'x1', title: 'Trump in Cina', url: 'https://www.lastampa.it/esteri/diretta/?ref=A', created: day(18), collection: 'Idee' }];
  const again = buildWhy({ item: { id: 'x2', title: 'Trump in Cina, abbraccio con Xi', url: 'https://www.lastampa.it/esteri/diretta/?ref=B' }, kind: 'read', base: 'Da leggere con calma.', me: me({ items: saved, profile: null }) });
  assert.equal(again, "L'avevi già salvato il 18 nov. Da leggere con calma.");
  const design = [
    { id: 'd1', title: 'QUINCY', note: 'Il divano Quincy abbandona le linee ortogonali', created: day(9), collection: 'Idee' },
    { id: 'd2', title: 'Lampada Arco', note: 'Design mid-century', created: day(4), collection: 'Idee' },
  ];
  const why = buildWhy({ item: { id: 'd3', title: 'Una poltrona in velluto di Cassina' }, kind: 'buy', base: "Da tenere d'occhio se ti interessa.", me: me({ items: design, profile: null }) });
  assert.equal(why, "Salvi spesso cose di design e arredamento: questa è la terza. Da tenere d'occhio se ti interessa.");
});
