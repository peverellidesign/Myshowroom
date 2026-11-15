// Server-side tests for "Chiedi consigli": a request is seen only by its
// owner and the friends asked; answers are revocable More for you grants.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node --test tests/asks.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const run = Date.now().toString(36);
const u = {};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const denied = (res, msg) => assert.ok(res.error, msg ?? 'expected the request to be refused');

async function makeUser(name) {
  const email = `${name}.${run}@asks.morethere.local`, password = `pw-${run}-${name}-Secret!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw error;
  const client = createClient(URL_, process.env.SUPABASE_ANON_KEY, opts);
  ok(await client.auth.signInWithPassword({ email, password }));
  const p = ok(await client.from('profiles').select('handle').eq('id', data.user.id).single());
  return { id: data.user.id, client, handle: p.handle };
}
async function connect(a, b) {
  ok(await a.client.rpc('request_connection', { p_handle: '@' + b.handle }));
  const c = ok(await b.client.from('connections').select('id').eq('requester_id', a.id).single());
  ok(await b.client.rpc('respond_connection', { p_connection: c.id, p_accept: true }));
}
const addItem = async (who, title) => ok(await who.client.from('items').insert({ title, category: 'Pagine' }).select('id').single()).id;

before(async () => {
  for (const n of ['matteo', 'luca', 'sara', 'eva']) u[n] = await makeUser(n);
  await connect(u.matteo, u.luca);
  await connect(u.matteo, u.sara);
  await connect(u.luca, u.eva); // Eva is Luca's friend, not Matteo's
});
after(async () => { for (const x of Object.values(u)) await admin.auth.admin.deleteUser(x.id).catch(() => {}); });

test('asking: only friends, written only through the function', async () => {
  const { matteo, luca, eva } = u;
  denied(await matteo.client.rpc('create_ask', { p_title: 'Firenze', p_note: '', p_recipients: [eva.id] }), 'not a friend');
  denied(await matteo.client.rpc('create_ask', { p_title: 'Firenze', p_note: '', p_recipients: [] }), 'nobody asked');
  denied(await matteo.client.rpc('create_ask', { p_title: '   ', p_note: '', p_recipients: [luca.id] }), 'empty title');
  denied(await matteo.client.from('asks').insert({ owner_id: matteo.id, title: 'x' }), 'no direct insert');
  denied(await matteo.client.from('ask_recipients').insert({ ask_id: crypto.randomUUID(), user_id: eva.id, owner_id: matteo.id }));
  const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY, opts);
  denied(await anon.rpc('create_ask', { p_title: 'x', p_note: '', p_recipients: [luca.id] }));
  for (const t of ['asks', 'ask_recipients']) { const r = await anon.from(t).select('*'); assert.ok(r.error || r.data.length === 0, `anon ${t}`); }
});

test('a request is seen by its owner and the friends asked, nobody else', async () => {
  const { matteo, luca, sara, eva } = u;
  const id = ok(await matteo.client.rpc('create_ask', { p_title: 'Firenze, a maggio', p_note: 'Ristoranti e musei', p_recipients: [luca.id] }));
  assert.equal(ok(await luca.client.from('asks').select('title').eq('id', id).single()).title, 'Firenze, a maggio');
  assert.equal(ok(await sara.client.from('asks').select('id')).length, 0, 'Sara was not asked');
  assert.equal(ok(await eva.client.from('asks').select('id')).length, 0);
  assert.equal(ok(await luca.client.from('ask_recipients').select('user_id')).length, 1, 'Luca sees only his own row');
  // Nobody can change a request; the friend cannot delete it.
  assert.equal(ok(await luca.client.from('asks').update({ title: 'hacked' }).eq('id', id).select()).length, 0);
  assert.equal(ok(await matteo.client.from('asks').update({ title: 'changed' }).eq('id', id).select()).length, 0);
  assert.equal(ok(await luca.client.from('asks').delete().eq('id', id).select()).length, 0);
});

test('answers: own memories only, by friends asked, revocable, and the request owner sees exactly those', async () => {
  const { matteo, luca, sara, eva } = u;
  const id = ok(await matteo.client.rpc('create_ask', { p_title: 'Roma', p_note: '', p_recipients: [luca.id] }));
  const lucaA = await addItem(luca, 'Trattoria a Trastevere');
  const lucaB = await addItem(luca, 'Villa Borghese all\'alba');
  const lucaPrivate = await addItem(luca, 'Diario privato');
  const saraItem = await addItem(sara, 'Sara posto');
  denied(await sara.client.rpc('answer_ask', { p_ask: id, p_items: [saraItem] }), 'Sara was not asked');
  denied(await eva.client.rpc('answer_ask', { p_ask: id, p_items: [] }), 'Eva was not asked');
  denied(await luca.client.rpc('answer_ask', { p_ask: id, p_items: [saraItem] }), 'not his memory');
  denied(await luca.client.rpc('answer_ask', { p_ask: id, p_items: [] }), 'nothing chosen');

  assert.equal(ok(await luca.client.rpc('answer_ask', { p_ask: id, p_items: [lucaA, lucaB], p_message: 'Da non perdere', p_allow_save: true })), 2);
  const seen = ok(await matteo.client.from('items').select('id').eq('owner_id', luca.id));
  assert.deepEqual(seen.map(i => i.id).sort(), [lucaA, lucaB].sort(), 'exactly the memories given, not the private one');
  assert.ok(!seen.some(i => i.id === lucaPrivate));
  const answers = ok(await matteo.client.from('thoughts').select('id, ask_id, allow_save, message').eq('sender_id', luca.id));
  assert.equal(answers.length, 2);
  assert.ok(answers.every(t => t.ask_id === id && t.allow_save && t.message === 'Da non perdere'));
  // Luca can take a memory back.
  ok(await luca.client.from('thoughts').delete().eq('id', answers[0].id));
  assert.equal(ok(await matteo.client.from('items').select('id').eq('owner_id', luca.id)).length, 1);

  // Deleting the request keeps the opened memories (they are Luca's to revoke).
  ok(await matteo.client.from('asks').delete().eq('id', id));
  assert.equal(ok(await luca.client.from('asks').select('id').eq('id', id)).length, 0);
  assert.equal(ok(await matteo.client.from('thoughts').select('ask_id').eq('sender_id', luca.id))[0].ask_id, null);

  // No longer friends: no more answers.
  const id2 = ok(await matteo.client.rpc('create_ask', { p_title: 'Napoli', p_note: '', p_recipients: [sara.id] }));
  ok(await sara.client.rpc('remove_connection', { p_other: matteo.id }));
  denied(await sara.client.rpc('answer_ask', { p_ask: id2, p_items: [saraItem] }), 'not connected any more');
});
