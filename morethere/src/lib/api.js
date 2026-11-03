// Supabase-backed data layer. Every call runs as the signed-in user; the
// database decides what that user may read or change (see supabase/migrations).

import { supabase } from './supabase.js';

const ERRORS = {
  profile_not_found: 'Nessuna persona con questo nome utente.',
  cannot_connect_to_self: 'Questo è il tuo nome utente.',
  connection_not_found: 'Richiesta non trovata.',
  rate_limited: 'Troppe richieste. Riprova più tardi.',
  invitation_invalid: 'Questo invito non è valido, è scaduto o è già stato usato.',
  cannot_accept_own_invitation: 'Non puoi accettare un tuo invito.',
  not_connected: 'Potete condividere solo tra persone connesse.',
  item_not_found: 'Elemento non disponibile.',
  save_not_permitted: 'Questa persona non ha consentito di salvare copie.',
  collection_not_found: 'Raccolta non trovata.',
  world_not_found: 'Mondo non disponibile.',
  invite_not_found: 'Invito non trovato.',
  thought_not_found: 'Pensiero non trovato.',
  not_authenticated: 'Accedi per continuare.',
};

export function friendlyError(error) {
  const msg = error?.message || String(error || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  if (key) return ERRORS[key];
  if (/duplicate key.*collections_owner_name/.test(msg)) return 'Hai già una raccolta con questo nome.';
  if (/duplicate key.*profiles_handle/.test(msg)) return 'Questo nome utente è già in uso.';
  if (/profiles_handle_format/.test(msg)) return 'Nome utente: 3–30 caratteri, lettere minuscole, numeri, punto o trattino basso.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Connessione assente. Riprova.';
  return 'Qualcosa non ha funzionato. Riprova.';
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const toItem = (row, collectionsById) => ({
  id: row.id,
  owner_id: row.owner_id,
  title: row.title,
  url: row.url || '',
  note: row.note || '',
  category: row.category,
  collection_id: row.collection_id,
  collection: row.collection_id ? collectionsById[row.collection_id]?.name || '' : '',
  created: Date.parse(row.created_at),
});

const ITEM_COLS = 'id, owner_id, collection_id, title, url, note, category, created_at';

async function profilesById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = must(await supabase.from('profiles').select('id, handle, display_name, subtitle').in('id', unique));
  return Object.fromEntries(rows.map(p => [p.id, p]));
}

export function createRemoteApi(user) {
  const me = user.id;

  return {
    social: true,
    me,

    // ---- profile ---------------------------------------------------------
    async loadProfile() {
      return must(await supabase.from('profiles').select('*').eq('id', me).single());
    },
    async updateProfile({ handle, display_name, subtitle }) {
      return must(await supabase.from('profiles')
        .update({ handle: handle.trim().toLowerCase().replace(/^@/, ''), display_name: display_name.trim(), subtitle: subtitle.trim() })
        .eq('id', me).select().single());
    },

    // ---- personal archive -----------------------------------------------
    async loadArchive() {
      const [cols, items] = await Promise.all([
        supabase.from('collections').select('id, name, position').eq('owner_id', me).order('position').order('created_at'),
        supabase.from('items').select(ITEM_COLS).eq('owner_id', me).order('created_at', { ascending: false }),
      ]);
      const collections = must(cols);
      const byId = Object.fromEntries(collections.map(c => [c.id, c]));
      return { collections, items: must(items).map(r => toItem(r, byId)) };
    },
    async addItem({ title, url, note, category, collection_id }) {
      return must(await supabase.from('items')
        .insert({ title, url: url || null, note: note || '', category, collection_id: collection_id || null })
        .select(ITEM_COLS).single());
    },
    async updateItem(id, patch) {
      const row = {};
      if ('collection_id' in patch) row.collection_id = patch.collection_id || null;
      must(await supabase.from('items').update(row).eq('id', id));
    },
    async deleteItem(id) {
      must(await supabase.from('items').delete().eq('id', id));
    },
    async addCollection(name, position) {
      return must(await supabase.from('collections').insert({ name, position }).select('id, name, position').single());
    },

    // ---- consent-based import of on-device data --------------------------
    async importLegacy({ items, collections, worlds }) {
      const archive = await this.loadArchive();
      const byName = Object.fromEntries(archive.collections.map(c => [c.name.trim().toLowerCase(), c.id]));
      const wanted = [...new Set([...collections, ...items.map(i => i.collection)].filter(Boolean))];
      let pos = archive.collections.length;
      for (const name of wanted) {
        const key = name.trim().toLowerCase();
        if (!byName[key]) byName[key] = (await this.addCollection(name.trim().slice(0, 60), pos++)).id;
      }
      const rows = items.map(i => ({
        client_ref: String(i.id).slice(0, 64),
        title: String(i.title || i.url || i.note || 'Senza titolo').slice(0, 300),
        url: /^https?:\/\//i.test(i.url || '') ? i.url : null,
        note: String(i.note || '').slice(0, 10000),
        category: String(i.category || 'Appunti').slice(0, 40),
        collection_id: i.collection ? byName[i.collection.trim().toLowerCase()] || null : null,
        created_at: i.created ? new Date(i.created).toISOString() : undefined,
      }));
      const inserted = rows.length
        ? must(await supabase.from('items').upsert(rows, { onConflict: 'owner_id,client_ref', ignoreDuplicates: false, defaultToNull: false })
            .select('id, client_ref'))
        : [];
      const idByRef = Object.fromEntries(inserted.map(r => [r.client_ref, r.id]));
      for (const w of worlds || []) {
        if (!w?.name) continue;
        const world = await this.createWorld(String(w.name).slice(0, 80));
        for (const ref of w.itemIds || []) {
          if (idByRef[ref]) await this.addItemToWorld(world.id, idByRef[ref]);
        }
      }
      return inserted.length;
    },

    // ---- circle: connections, invitations -------------------------------
    async loadCircle() {
      const conns = must(await supabase.from('connections').select('*').order('created_at', { ascending: false }));
      const otherIds = conns.map(c => (c.requester_id === me ? c.addressee_id : c.requester_id));
      const people = await profilesById(otherIds);
      const connections = conns
        .filter(c => c.status !== 'declined')
        .map(c => {
          const otherId = c.requester_id === me ? c.addressee_id : c.requester_id;
          return {
            id: c.id,
            status: c.status,
            incoming: c.addressee_id === me,
            other: people[otherId] || { id: otherId, display_name: 'Persona', handle: '', subtitle: '' },
          };
        });
      const [sharesOut, sharesIn, invites] = await Promise.all([
        supabase.from('world_shares').select('*, world_share_collections(collection_id)').eq('owner_id', me),
        supabase.from('world_shares').select('*').eq('grantee_id', me),
        supabase.from('invitations').select('id, created_at, expires_at, revoked_at, accepted_at, accepted_by')
          .eq('inviter_id', me).order('created_at', { ascending: false }).limit(20),
      ]);
      return {
        connections,
        sharesOut: must(sharesOut).map(s => ({ ...s, collection_ids: (s.world_share_collections || []).map(x => x.collection_id) })),
        sharesIn: must(sharesIn),
        invitations: must(invites),
      };
    },
    async requestConnection(handle) {
      return must(await supabase.rpc('request_connection', { p_handle: handle }));
    },
    async respondConnection(id, accept) {
      return must(await supabase.rpc('respond_connection', { p_connection: id, p_accept: accept }));
    },
    async removeConnection(otherId) {
      must(await supabase.rpc('remove_connection', { p_other: otherId }));
    },
    async createInvitation() {
      const [row] = must(await supabase.rpc('create_invitation'));
      return row;
    },
    async revokeInvitation(id) {
      must(await supabase.rpc('revoke_invitation', { p_invitation: id }));
    },
    async previewInvitation(token) {
      const rows = must(await supabase.rpc('preview_invitation', { p_token: token }));
      return rows[0] || null;
    },
    async acceptInvitation(token) {
      return must(await supabase.rpc('accept_invitation', { p_token: token }));
    },

    // ---- enter my world: grants -----------------------------------------
    async setShare({ granteeId, scope, canSave, allowAi, collectionIds }) {
      return must(await supabase.rpc('set_world_share', {
        p_grantee: granteeId, p_scope: scope, p_can_save: canSave,
        p_allow_ai_export: allowAi, p_collection_ids: scope === 'collections' ? collectionIds : [],
      }));
    },
    async revokeShare(granteeId) {
      must(await supabase.from('world_shares').delete().eq('owner_id', me).eq('grantee_id', granteeId));
    },
    async loadFriendWorld(ownerId) {
      const [share, cols, items] = await Promise.all([
        supabase.from('world_shares').select('*').eq('owner_id', ownerId).eq('grantee_id', me).maybeSingle(),
        supabase.from('collections').select('id, name, position').eq('owner_id', ownerId).order('position'),
        supabase.from('items').select(ITEM_COLS).eq('owner_id', ownerId).order('created_at', { ascending: false }),
      ]);
      const collections = must(cols);
      const byId = Object.fromEntries(collections.map(c => [c.id, c]));
      return { share: must(share), collections, items: must(items).map(r => toItem(r, byId)) };
    },
    async saveSharedItem(itemId, collectionId) {
      return must(await supabase.rpc('save_shared_item', { p_item: itemId, p_collection: collectionId || null }));
    },

    // ---- thought of you --------------------------------------------------
    async loadThoughts() {
      const rows = must(await supabase.from('thoughts').select('*').order('created_at', { ascending: false }).limit(200));
      const people = await profilesById(rows.flatMap(t => [t.sender_id, t.recipient_id]));
      const withPeople = rows.map(t => ({ ...t, sender: people[t.sender_id], recipient: people[t.recipient_id] }));
      return {
        sent: withPeople.filter(t => t.sender_id === me),
        received: withPeople.filter(t => t.recipient_id === me),
      };
    },
    async sendThought({ recipientId, itemId, message, allowAi }) {
      return must(await supabase.rpc('send_thought', {
        p_recipient: recipientId, p_item: itemId, p_message: message, p_allow_ai_export: allowAi,
      }));
    },
    async markThoughtRead(id) { must(await supabase.rpc('mark_thought_read', { p_thought: id })); },
    async saveThought(id) { return must(await supabase.rpc('save_thought', { p_thought: id })); },
    async deleteThought(id) { must(await supabase.from('thoughts').delete().eq('id', id)); },

    // ---- our little world ------------------------------------------------
    async loadWorlds() {
      const memberships = must(await supabase.from('world_members').select('world_id, status, role').eq('user_id', me));
      if (!memberships.length) return [];
      const ids = memberships.map(m => m.world_id);
      const [worlds, members, items] = await Promise.all([
        supabase.from('worlds').select('*').in('id', ids).order('created_at', { ascending: false }),
        supabase.from('world_members').select('world_id, user_id, status, role').in('world_id', ids),
        supabase.from('world_items').select('world_id').in('world_id', ids),
      ]);
      const allMembers = must(members);
      const people = await profilesById([...allMembers.map(m => m.user_id), ...must(worlds).map(w => w.owner_id)]);
      const counts = {};
      must(items).forEach(i => { counts[i.world_id] = (counts[i.world_id] || 0) + 1; });
      return must(worlds).map(w => {
        const mine = memberships.find(m => m.world_id === w.id);
        return {
          ...w,
          myStatus: mine?.status,
          myRole: mine?.role,
          owner: people[w.owner_id],
          others: allMembers.filter(m => m.world_id === w.id && m.user_id !== me)
            .map(m => ({ ...m, profile: people[m.user_id] })),
          count: counts[w.id] || 0,
        };
      });
    },
    async loadWorld(id) {
      const [world, members, items] = await Promise.all([
        supabase.from('worlds').select('*').eq('id', id).single(),
        supabase.from('world_members').select('*').eq('world_id', id),
        supabase.from('world_items').select('*').eq('world_id', id).order('created_at', { ascending: false }),
      ]);
      const m = must(members);
      const it = must(items);
      const people = await profilesById([...m.map(x => x.user_id), ...it.map(x => x.added_by)]);
      return {
        world: must(world),
        members: m.map(x => ({ ...x, profile: people[x.user_id] })),
        items: it.map(x => ({ ...x, url: x.url || '', adder: people[x.added_by] })),
      };
    },
    async createWorld(name) {
      return must(await supabase.from('worlds').insert({ name }).select().single());
    },
    async renameWorld(id, name) { must(await supabase.from('worlds').update({ name }).eq('id', id)); },
    async deleteWorld(id) { must(await supabase.from('worlds').delete().eq('id', id)); },
    async inviteToWorld(worldId, userId) {
      must(await supabase.rpc('invite_to_world', { p_world: worldId, p_user: userId }));
    },
    async respondWorldInvite(worldId, accept) {
      must(await supabase.rpc('respond_world_invite', { p_world: worldId, p_accept: accept }));
    },
    async removeWorldMember(worldId, userId) {
      must(await supabase.from('world_members').delete().eq('world_id', worldId).eq('user_id', userId));
    },
    async setWorldAiConsent(worldId, allow) {
      must(await supabase.rpc('set_world_ai_consent', { p_world: worldId, p_allow: allow }));
    },
    async addItemToWorld(worldId, itemId) {
      return must(await supabase.rpc('add_item_to_world', { p_world: worldId, p_item: itemId }));
    },
    async removeWorldItem(id) { must(await supabase.from('world_items').delete().eq('id', id)); },

    // ---- AI Context Builder (server-side consent checks) -----------------
    async aiExportWorld(worldId) { return must(await supabase.rpc('ai_export_world', { p_world: worldId })); },
    async aiExportShared(ownerId) { return must(await supabase.rpc('ai_export_shared', { p_owner: ownerId })); },
    async aiExportThoughts() { return must(await supabase.rpc('ai_export_thoughts')); },

    // ---- account ----------------------------------------------------------
    async exportMyData() { return must(await supabase.rpc('export_my_data')); },
    async deleteAccount() {
      must(await supabase.rpc('delete_my_account'));
      await supabase.auth.signOut({ scope: 'local' });
    },
    async signOut() { await supabase.auth.signOut(); },

    // ---- synchronisation ----------------------------------------------------
    // Change events are filtered by RLS on the server; on any change we
    // re-read the affected area so state always matches what we may see.
    subscribe(onChange) {
      const tables = ['items', 'collections', 'connections', 'world_shares', 'world_share_collections',
        'thoughts', 'worlds', 'world_members', 'world_items', 'profiles'];
      const channel = supabase.channel(`sync:${me}`);
      tables.forEach(table => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      });
      channel.subscribe();
      return () => { supabase.removeChannel(channel); };
    },
  };
}
