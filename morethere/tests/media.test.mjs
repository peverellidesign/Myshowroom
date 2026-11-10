// Authorization tests for photos in the private "media" bucket.
// Same setup as authz.test.mjs: real users over the public API.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const run = Date.now().toString(36);
const u = {};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])], { type: 'image/jpeg' });
const canRead = async (who, path) => !(await who.client.storage.from('media').download(path)).error;

async function makeUser(name) {
  const email = `${name}.${run}@media.morethere.local`;
  const password = `pw-${run}-${name}-Secret!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw error;
  const client = createClient(URL_, ANON, opts);
  ok(await client.auth.signInWithPassword({ email, password }));
  const handle = ok(await client.from('profiles').select('handle').eq('id', data.user.id).single()).handle;
  return { id: data.user.id, client, handle };
}
async function connect(a, b) {
  const [inv] = ok(await a.client.rpc('create_invitation'));
  ok(await b.client.rpc('accept_invitation', { p_token: inv.token }));
}
async function upload(who) {
  const path = `${who.id}/${crypto.randomUUID()}.jpg`;
  ok(await who.client.storage.from('media').upload(path, jpeg(), { contentType: 'image/jpeg' }));
  return path;
}

let photo; let item; let viaggi;

before(async () => {
  for (const n of ['alice', 'bob', 'carol']) u[n] = await makeUser(n);
  await connect(u.alice, u.bob);
  viaggi = ok(await u.alice.client.from('collections').select('id').eq('owner_id', u.alice.id).eq('name', 'Viaggi').single()).id;
  photo = await upload(u.alice);
  item = ok(await u.alice.client.from('items').insert({ title: 'Foto Kyoto', category: 'Foto', collection_id: viaggi, image_path: photo }).select().single());
});

after(async () => {
  for (const x of Object.values(u)) {
    const { data } = await admin.storage.from('media').list(x.id);
    if (data?.length) await admin.storage.from('media').remove(data.map(f => `${x.id}/${f.name}`));
    await admin.auth.admin.deleteUser(x.id).catch(() => {});
  }
});

test('photos are private by default', async () => {
  assert.ok(await canRead(u.alice, photo), 'owner reads');
  assert.ok(!(await canRead(u.bob, photo)), 'connection without grant cannot read');
  assert.ok(!(await canRead(u.carol, photo)), 'stranger cannot read');
  const anon = createClient(URL_, ANON, opts);
  assert.ok((await anon.storage.from('media').download(photo)).error, 'anonymous cannot read');
});

test('no one can write into or delete from someone else\'s folder', async () => {
  const r = await u.bob.client.storage.from('media').upload(`${u.alice.id}/${crypto.randomUUID()}.jpg`, jpeg(), { contentType: 'image/jpeg' });
  assert.ok(r.error, 'upload into another folder refused');
  await u.bob.client.storage.from('media').remove([photo]);
  assert.ok(await canRead(u.alice, photo), 'file still there after a foreign delete attempt');
  const bad = await u.bob.client.storage.from('media').upload(`${u.bob.id}/${crypto.randomUUID()}.jpg`, new Blob(['<script>'], { type: 'text/html' }), { contentType: 'text/html' });
  assert.ok(bad.error, 'only images are accepted');
});

test('a row cannot reference someone else\'s file to gain access', async () => {
  const r = await u.bob.client.from('items').insert({ title: 'steal', image_path: photo });
  assert.ok(r.error, 'check constraint refuses a foreign path');
  assert.ok(!(await canRead(u.bob, photo)));
});

test('photo access follows the grant, and revocation removes it', async () => {
  ok(await u.alice.client.rpc('set_world_share', { p_grantee: u.bob.id, p_scope: 'collections', p_can_save: true, p_allow_ai_export: false, p_collection_ids: [viaggi] }));
  assert.ok(await canRead(u.bob, photo), 'grantee reads the shared photo');
  // A saved copy gets its own file in the saver's folder.
  const newId = ok(await u.bob.client.rpc('save_shared_item', { p_item: item.id }));
  const copyPath = `${u.bob.id}/${crypto.randomUUID()}.jpg`;
  ok(await u.bob.client.storage.from('media').copy(photo, copyPath));
  ok(await u.bob.client.from('items').update({ image_path: copyPath }).eq('id', newId));
  ok(await u.alice.client.from('world_shares').delete().eq('grantee_id', u.bob.id));
  assert.ok(!(await canRead(u.bob, photo)), 'revoked');
  assert.ok(await canRead(u.bob, copyPath), 'own copy survives revocation');
  assert.ok(!(await canRead(u.alice, copyPath)), 'and is private to the saver');
});

test('thoughts and worlds carry the photo to exactly the right people', async () => {
  const tid = ok(await u.alice.client.rpc('send_thought', { p_recipient: u.bob.id, p_item: item.id, p_message: 'guarda', p_allow_ai_export: false }));
  const t = ok(await u.bob.client.from('thoughts').select('item_image_path').eq('id', tid).single());
  assert.equal(t.item_image_path, photo);
  assert.ok(await canRead(u.bob, photo), 'recipient reads');
  assert.ok(!(await canRead(u.carol, photo)), 'others still cannot');
  ok(await u.alice.client.from('thoughts').delete().eq('id', tid));
  assert.ok(!(await canRead(u.bob, photo)), 'unsent thought removes access');

  await connect(u.alice, u.carol);
  const w = ok(await u.alice.client.from('worlds').insert({ name: 'Foto insieme' }).select().single());
  ok(await u.alice.client.rpc('add_item_to_world', { p_world: w.id, p_item: item.id }));
  ok(await u.alice.client.rpc('invite_to_world', { p_world: w.id, p_user: u.carol.id }));
  assert.ok(!(await canRead(u.carol, photo)), 'invited but not joined');
  ok(await u.carol.client.rpc('respond_world_invite', { p_world: w.id, p_accept: true }));
  assert.ok(await canRead(u.carol, photo), 'member reads');
  assert.ok(!(await canRead(u.bob, photo)), 'non-member cannot');
});

test('the date of a memory travels with thoughts, worlds and saved copies', async () => {
  const it = ok(await u.alice.client.from('items').insert({ title: 'Tramonto a Kyoto', category: 'Foto', collection_id: viaggi, memory_date: '2019-08-15' }).select().single());
  assert.equal(it.memory_date, '2019-08-15');
  const bad = await u.alice.client.from('items').insert({ title: 'x', memory_date: '1500-01-01' });
  assert.ok(bad.error, 'implausible dates are refused');
  const tid = ok(await u.alice.client.rpc('send_thought', { p_recipient: u.bob.id, p_item: it.id, p_message: '', p_allow_ai_export: false }));
  assert.equal(ok(await u.bob.client.from('thoughts').select('item_memory_date').eq('id', tid).single()).item_memory_date, '2019-08-15');
  const kept = ok(await u.bob.client.rpc('save_thought', { p_thought: tid }));
  assert.equal(ok(await u.bob.client.from('items').select('memory_date').eq('id', kept).single()).memory_date, '2019-08-15');
  const w = ok(await u.alice.client.from('worlds').insert({ name: 'Date' }).select().single());
  const wi = ok(await u.alice.client.rpc('add_item_to_world', { p_world: w.id, p_item: it.id }));
  assert.equal(ok(await u.alice.client.from('world_items').select('memory_date').eq('id', wi).single()).memory_date, '2019-08-15');
});
