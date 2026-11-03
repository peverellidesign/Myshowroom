// Server-side authorization tests for morethere.
//
// Runs against a real Supabase stack (local: `npx supabase start`).
// Every assertion goes through the public Data API with real user sessions,
// exactly as the browser app does, so RLS and RPC checks are what is tested.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:authz

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const run = Date.now().toString(36);
const users = {};

async function makeUser(name) {
  const email = `${name}.${run}@test.morethere.local`;
  const password = `pw-${run}-${name}-Secret!`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) throw error;
  const client = createClient(URL_, ANON, opts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data: profile } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  return { id: data.user.id, email, client, handle: profile.handle };
}

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const denied = (res, msg) => assert.ok(res.error, msg ?? 'expected the request to be refused');
// A write that is either refused outright or silently matches no rows.
const noEffect = (res, msg) => assert.ok(res.error || res.data.length === 0, msg ?? 'expected no effect');

async function collectionId(u, name) {
  return ok(await u.client.from('collections').select('id').eq('owner_id', u.id).eq('name', name).single()).id;
}

before(async () => {
  for (const n of ['alice', 'bob', 'carol', 'dave']) users[n] = await makeUser(n);
  const { alice } = users;
  const idee = await collectionId(alice, 'Idee');
  const viaggi = await collectionId(alice, 'Viaggi');
  ok(await alice.client.from('items').insert([
    { title: 'Alice private idea', note: 'secret', category: 'Appunti', collection_id: idee },
    { title: 'Alice trip', url: 'https://example.com/kyoto', category: 'Pagine', collection_id: viaggi },
    { title: 'Alice loose note', note: 'no collection', category: 'Appunti' },
  ]));
});

after(async () => {
  for (const u of Object.values(users)) {
    await u.client.removeAllChannels();
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
});

test('new users get a profile and default collections', async () => {
  const { alice } = users;
  const cols = ok(await alice.client.from('collections').select('name').order('position'));
  assert.deepEqual(cols.map(c => c.name), ['Idee', 'Viaggi', 'Posti da provare']);
  assert.match(alice.handle, /^alice/);
});

test('anonymous visitors cannot read or call anything', async () => {
  const anon = createClient(URL_, ANON, opts);
  for (const t of ['items', 'collections', 'profiles', 'thoughts', 'worlds', 'world_items', 'connections']) {
    const r = await anon.from(t).select('*');
    assert.ok(r.error || r.data.length === 0, `anon read ${t}`);
  }
  denied(await anon.rpc('create_invitation'));
  denied(await anon.rpc('export_my_data'));
});

test('archives are private by default', async () => {
  const { alice, bob } = users;
  assert.equal(ok(await bob.client.from('items').select('*').eq('owner_id', alice.id)).length, 0);
  assert.equal(ok(await bob.client.from('collections').select('*').eq('owner_id', alice.id)).length, 0);
  assert.equal(ok(await bob.client.from('profiles').select('*').eq('id', alice.id)).length, 0);
  assert.equal(ok(await alice.client.from('items').select('*')).length, 3);
});

test('users cannot write into someone else\'s archive', async () => {
  const { alice, bob } = users;
  denied(await bob.client.from('items').insert({ owner_id: alice.id, title: 'planted' }));
  const aliceItem = ok(await alice.client.from('items').select('id').limit(1).single());
  const upd = ok(await bob.client.from('items').update({ title: 'hacked' }).eq('id', aliceItem.id).select());
  assert.equal(upd.length, 0);
  const del = ok(await bob.client.from('items').delete().eq('id', aliceItem.id).select());
  assert.equal(del.length, 0);
  // Bob cannot file his item into Alice's collection.
  const idee = await collectionId(alice, 'Idee');
  denied(await bob.client.from('items').insert({ title: 'x', collection_id: idee }));
  // Bob cannot take over Alice's profile.
  const p = ok(await bob.client.from('profiles').update({ display_name: 'pwned' }).eq('id', alice.id).select());
  assert.equal(p.length, 0);
  // Only http(s) URLs are accepted.
  denied(await bob.client.from('items').insert({ title: 'x', url: 'javascript:alert(1)' }));
});

test('helper functions used by policies are not exposed over the API', async () => {
  const { bob, alice } = users;
  denied(await bob.client.rpc('are_connected', { a: alice.id, b: bob.id }));
  denied(await bob.client.rpc('enforce_rate_limit', { p_action: 'x', p_max: 1, p_window: '1 day' }));
});

test('connections need the other person to accept', async () => {
  const { alice, bob } = users;
  denied(await bob.client.from('connections').insert({ requester_id: bob.id, addressee_id: alice.id, status: 'accepted' }));
  assert.equal(ok(await bob.client.rpc('request_connection', { p_handle: '@' + alice.handle })), 'pending');
  const conn = ok(await alice.client.from('connections').select('*').eq('requester_id', bob.id).single());
  // The requester cannot accept on the addressee's behalf.
  denied(await bob.client.rpc('respond_connection', { p_connection: conn.id, p_accept: true }));
  // While pending, Alice can see who is asking.
  assert.equal(ok(await alice.client.from('profiles').select('id').eq('id', bob.id)).length, 1);
  assert.equal(ok(await alice.client.rpc('respond_connection', { p_connection: conn.id, p_accept: true })), 'accepted');
  // Connected, but still no grant: the archive stays private.
  assert.equal(ok(await bob.client.from('items').select('*').eq('owner_id', alice.id)).length, 0);
  denied(await bob.client.rpc('request_connection', { p_handle: 'nobody_here_' + run }));
});

test('grants require a trusted connection and cannot be forged', async () => {
  const { alice, bob, carol } = users;
  denied(await alice.client.from('world_shares').insert({ grantee_id: carol.id, scope: 'all' }));
  denied(await bob.client.from('world_shares').insert({ owner_id: alice.id, grantee_id: bob.id, scope: 'all' }));
  denied(await carol.client.rpc('set_world_share', {
    p_grantee: bob.id, p_scope: 'all', p_can_save: true, p_allow_ai_export: true, p_collection_ids: [],
  }));
});

test('selected collections: grantee sees exactly what was granted', async () => {
  const { alice, bob } = users;
  const viaggi = await collectionId(alice, 'Viaggi');
  ok(await alice.client.rpc('set_world_share', {
    p_grantee: bob.id, p_scope: 'collections', p_can_save: false, p_allow_ai_export: false, p_collection_ids: [viaggi],
  }));
  const items = ok(await bob.client.from('items').select('title').eq('owner_id', alice.id));
  assert.deepEqual(items.map(i => i.title), ['Alice trip']);
  const cols = ok(await bob.client.from('collections').select('name').eq('owner_id', alice.id));
  assert.deepEqual(cols.map(c => c.name), ['Viaggi']);
  // Bob cannot widen the grant himself.
  const share = ok(await bob.client.from('world_shares').select('*').eq('owner_id', alice.id).single());
  const idee = await collectionId(alice, 'Idee');
  denied(await bob.client.from('world_share_collections').insert({ share_id: share.id, collection_id: idee, owner_id: alice.id }));
  const upd = ok(await bob.client.from('world_shares').update({ scope: 'all' }).eq('id', share.id).select());
  assert.equal(upd.length, 0);
  // Read-only grant: saving a copy is refused, and so is AI export.
  const trip = items[0] && ok(await bob.client.from('items').select('id').eq('owner_id', alice.id).single());
  denied(await bob.client.rpc('save_shared_item', { p_item: trip.id }));
  assert.equal(ok(await bob.client.rpc('ai_export_shared', { p_owner: alice.id })).length, 0);
});

test('save and AI export only when explicitly permitted', async () => {
  const { alice, bob } = users;
  const viaggi = await collectionId(alice, 'Viaggi');
  ok(await alice.client.rpc('set_world_share', {
    p_grantee: bob.id, p_scope: 'collections', p_can_save: true, p_allow_ai_export: true, p_collection_ids: [viaggi],
  }));
  const trip = ok(await bob.client.from('items').select('id').eq('owner_id', alice.id).single());
  const newId = ok(await bob.client.rpc('save_shared_item', { p_item: trip.id }));
  const copy = ok(await bob.client.from('items').select('owner_id,title').eq('id', newId).single());
  assert.equal(copy.owner_id, bob.id);
  assert.equal(copy.title, 'Alice trip');
  const exp = ok(await bob.client.rpc('ai_export_shared', { p_owner: alice.id }));
  assert.deepEqual(exp.map(r => r.title), ['Alice trip']);
  // Private items never leak through the export.
  assert.ok(!exp.some(r => r.title.includes('private')));
  // An item outside the grant cannot be copied even with save permission.
  const priv = ok(await alice.client.from('items').select('id').eq('title', 'Alice private idea').single());
  denied(await bob.client.rpc('save_shared_item', { p_item: priv.id }));
});

test('"entire world" scope, then revocation removes access immediately', async () => {
  const { alice, bob } = users;
  ok(await alice.client.rpc('set_world_share', {
    p_grantee: bob.id, p_scope: 'all', p_can_save: false, p_allow_ai_export: false, p_collection_ids: [],
  }));
  assert.equal(ok(await bob.client.from('items').select('id').eq('owner_id', alice.id)).length, 3);
  ok(await alice.client.from('world_shares').delete().eq('grantee_id', bob.id));
  assert.equal(ok(await bob.client.from('items').select('id').eq('owner_id', alice.id)).length, 0);
});

test('removing a connection revokes every grant between the two people', async () => {
  const { alice, bob } = users;
  ok(await alice.client.rpc('set_world_share', {
    p_grantee: bob.id, p_scope: 'all', p_can_save: true, p_allow_ai_export: true, p_collection_ids: [],
  }));
  assert.equal(ok(await bob.client.from('items').select('id').eq('owner_id', alice.id)).length, 3);
  ok(await bob.client.rpc('remove_connection', { p_other: alice.id }));
  assert.equal(ok(await bob.client.from('items').select('id').eq('owner_id', alice.id)).length, 0);
  assert.equal(ok(await alice.client.from('world_shares').select('id')).length, 0);
  assert.equal(ok(await bob.client.from('profiles').select('id').eq('id', alice.id)).length, 0);
});

test('invitations are single-use, revocable and never expose the token', async () => {
  const { alice, carol, dave } = users;
  const [inv] = ok(await alice.client.rpc('create_invitation'));
  assert.ok(inv.token.length >= 40);
  denied(await alice.client.from('invitations').select('token_hash'));
  assert.equal(ok(await carol.client.from('invitations').select('id')).length, 0);
  const [preview] = ok(await carol.client.rpc('preview_invitation', { p_token: inv.token }));
  assert.equal(preview.inviter_handle, alice.handle);
  denied(await alice.client.rpc('accept_invitation', { p_token: inv.token }), 'cannot accept own invite');
  assert.equal(ok(await carol.client.rpc('accept_invitation', { p_token: inv.token })), alice.id);
  denied(await dave.client.rpc('accept_invitation', { p_token: inv.token }), 'token reuse');
  denied(await dave.client.rpc('accept_invitation', { p_token: 'guess' }), 'random token');
  const [inv2] = ok(await alice.client.rpc('create_invitation'));
  ok(await alice.client.rpc('revoke_invitation', { p_invitation: inv2.id }));
  denied(await dave.client.rpc('accept_invitation', { p_token: inv2.token }), 'revoked token');
  // Alice and Carol are now connected; Alice and Dave are not.
  assert.equal(ok(await carol.client.from('profiles').select('id').eq('id', alice.id)).length, 1);
  assert.equal(ok(await dave.client.from('profiles').select('id').eq('id', alice.id)).length, 0);
});

test('Thought of you: only to connections, only your own items, snapshot only', async () => {
  const { alice, bob, carol, dave } = users;
  const trip = ok(await alice.client.from('items').select('id').eq('title', 'Alice trip').single());
  denied(await alice.client.rpc('send_thought', { p_recipient: dave.id, p_item: trip.id, p_message: 'hi' }), 'not connected');
  denied(await alice.client.from('thoughts').insert({ sender_id: alice.id, recipient_id: dave.id, item_title: 'x' }));
  const bobItem = ok(await bob.client.from('items').select('id').eq('owner_id', bob.id).limit(1).single());
  denied(await alice.client.rpc('send_thought', { p_recipient: carol.id, p_item: bobItem.id, p_message: '' }), 'not own item');

  const tid = ok(await alice.client.rpc('send_thought', {
    p_recipient: carol.id, p_item: trip.id, p_message: 'Ho pensato a te', p_allow_ai_export: false,
  }));
  const got = ok(await carol.client.from('thoughts').select('*').eq('id', tid).single());
  assert.equal(got.item_title, 'Alice trip');
  assert.equal(got.message, 'Ho pensato a te');
  // The recipient gets the snapshot, not access to the archive.
  assert.equal(ok(await carol.client.from('items').select('id').eq('owner_id', alice.id)).length, 0);
  assert.equal(ok(await dave.client.from('thoughts').select('id')).length, 0);
  noEffect(await carol.client.from('thoughts').update({ message: 'edited' }).eq('id', tid).select());
  assert.equal(ok(await carol.client.rpc('ai_export_thoughts')).length, 0, 'AI export not permitted');

  ok(await carol.client.rpc('mark_thought_read', { p_thought: tid }));
  const saved = ok(await carol.client.rpc('save_thought', { p_thought: tid }));
  assert.equal(ok(await carol.client.from('items').select('owner_id').eq('id', saved).single()).owner_id, carol.id);

  const tid2 = ok(await alice.client.rpc('send_thought', {
    p_recipient: carol.id, p_item: trip.id, p_message: 'per l\'AI', p_allow_ai_export: true,
  }));
  const exp = ok(await carol.client.rpc('ai_export_thoughts'));
  assert.equal(exp.length, 1);
  assert.match(exp[0].note, /per l'AI/);
  // Sender can unsend; recipient cannot delete the sender's record.
  const del = ok(await carol.client.from('thoughts').delete().eq('id', tid2).select());
  assert.equal(del.length, 0);
  ok(await alice.client.from('thoughts').delete().eq('id', tid2));
});

test('Our little world: membership by consent, contributions, per-member AI consent', async () => {
  const { alice, carol, dave } = users;
  const world = ok(await alice.client.from('worlds').insert({ name: 'Japan 2027' }).select().single());
  denied(await alice.client.rpc('invite_to_world', { p_world: world.id, p_user: dave.id }), 'not connected');
  denied(await dave.client.rpc('invite_to_world', { p_world: world.id, p_user: dave.id }), 'not a member');
  denied(await dave.client.from('world_items').insert({ world_id: world.id, title: 'spam' }));
  assert.equal(ok(await dave.client.from('worlds').select('id').eq('id', world.id)).length, 0);

  const trip = ok(await alice.client.from('items').select('id').eq('title', 'Alice trip').single());
  ok(await alice.client.rpc('add_item_to_world', { p_world: world.id, p_item: trip.id }));

  ok(await alice.client.rpc('invite_to_world', { p_world: world.id, p_user: carol.id }));
  // Invited but not yet joined: sees the world name, not its contents.
  assert.equal(ok(await carol.client.from('worlds').select('name').eq('id', world.id)).length, 1);
  assert.equal(ok(await carol.client.from('world_items').select('id').eq('world_id', world.id)).length, 0);
  ok(await carol.client.rpc('respond_world_invite', { p_world: world.id, p_accept: true }));
  assert.equal(ok(await carol.client.from('world_items').select('id').eq('world_id', world.id)).length, 1);

  const carolItem = ok(await carol.client.from('items').insert({ title: 'Carol ryokan', category: 'Posti' }).select().single());
  ok(await carol.client.rpc('add_item_to_world', { p_world: world.id, p_item: carolItem.id }));
  denied(await carol.client.rpc('add_item_to_world', { p_world: world.id, p_item: trip.id }), 'not her item');
  const ren = ok(await carol.client.from('worlds').update({ name: 'mine' }).eq('id', world.id).select());
  assert.equal(ren.length, 0, 'only the owner renames');
  const aliceWi = ok(await alice.client.from('world_items').select('id').eq('world_id', world.id).eq('added_by', alice.id).single());
  const rm = ok(await carol.client.from('world_items').delete().eq('id', aliceWi.id).select());
  assert.equal(rm.length, 0, 'members cannot remove others\' contributions');

  // AI export: Alice gets her own items, Carol's only after Carol consents.
  let exp = ok(await alice.client.rpc('ai_export_world', { p_world: world.id }));
  assert.deepEqual(exp.map(r => r.title), ['Alice trip']);
  ok(await carol.client.rpc('set_world_ai_consent', { p_world: world.id, p_allow: true }));
  exp = ok(await alice.client.rpc('ai_export_world', { p_world: world.id }));
  assert.deepEqual(exp.map(r => r.title).sort(), ['Alice trip', 'Carol ryokan']);
  assert.equal(ok(await dave.client.rpc('ai_export_world', { p_world: world.id })).length, 0);

  // Leaving removes access.
  ok(await carol.client.from('world_members').delete().eq('world_id', world.id).eq('user_id', carol.id));
  assert.equal(ok(await carol.client.from('world_items').select('id').eq('world_id', world.id)).length, 0);
  // The owner cannot be removed from their own world.
  const ownerRm = ok(await alice.client.from('world_members').delete().eq('world_id', world.id).eq('user_id', alice.id).select());
  assert.equal(ownerRm.length, 0);
});

test('realtime sync delivers only rows the subscriber may see', async () => {
  const { alice, carol } = users;
  const viaggi = await collectionId(alice, 'Viaggi');
  const idee = await collectionId(alice, 'Idee');
  ok(await alice.client.rpc('set_world_share', {
    p_grantee: carol.id, p_scope: 'collections', p_can_save: false, p_allow_ai_export: false, p_collection_ids: [viaggi],
  }));
  const seen = [];
  await new Promise((resolve, reject) => {
    carol.client.channel('t-items')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' }, p => seen.push(p.new.title))
      .subscribe((s, err) => (s === 'SUBSCRIBED' ? resolve() : (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') && reject(new Error(s + ' ' + (err?.message ?? '')))));
  });
  await new Promise(r => setTimeout(r, 1000));
  ok(await alice.client.from('items').insert({ title: 'RT private', collection_id: idee }));
  ok(await alice.client.from('items').insert({ title: 'RT shared', collection_id: viaggi }));
  for (let i = 0; i < 40 && !seen.includes('RT shared'); i++) await new Promise(r => setTimeout(r, 250));
  await new Promise(r => setTimeout(r, 500));
  assert.ok(seen.includes('RT shared'), 'shared insert delivered');
  assert.ok(!seen.includes('RT private'), 'private insert not delivered');
});

test('users can export all their own data and delete their account', async () => {
  const { dave } = users;
  ok(await dave.client.from('items').insert({ title: 'Dave note' }));
  const dump = ok(await dave.client.rpc('export_my_data'));
  assert.equal(dump.profile.id, dave.id);
  assert.deepEqual(dump.items.map(i => i.title), ['Dave note']);
  ok(await dave.client.rpc('delete_my_account'));
  const { data } = await admin.from('profiles').select('id').eq('id', dave.id);
  assert.equal(data.length, 0);
  const { data: u } = await admin.auth.admin.getUserById(dave.id);
  assert.equal(u.user, null);
});
