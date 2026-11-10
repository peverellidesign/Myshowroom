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
  world_not_found: 'Spazio non disponibile.',
  invite_not_found: 'Invito non trovato.',
  thought_not_found: 'Pensiero non trovato.',
  not_authenticated: 'Accedi per continuare.',
  photos_unavailable: 'Le foto non sono ancora attive su questo server.',
  image_unreadable: 'Questa immagine non si può leggere. Prova con una foto JPEG o PNG.',
  'exceeded the maximum allowed size': 'La foto è troppo grande (massimo 5 MB).',
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

// ---- photos ----------------------------------------------------------------
// Resized on the device before upload (max 1600px, JPEG), stored privately.
export async function resizeImage(file, max = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) throw new Error('image_unreadable');
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('image_unreadable'))), 'image/jpeg', quality));
}

// When was this photo taken? Reads DateTimeOriginal from the JPEG's EXIF
// (resizing drops EXIF, so this runs on the original file). Falls back to the
// file's date. Returns 'YYYY-MM-DD' or null.
export async function photoTakenDate(file) {
  const iso = (y, m, d) => (y > 1800 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) === 0xffd8) {
      let off = 2;
      while (off + 4 < v.byteLength) {
        const marker = v.getUint16(off); const len = v.getUint16(off + 2);
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) { // "Exif"
          const t = off + 10; const le = v.getUint16(t) === 0x4949;
          const u16 = o => v.getUint16(t + o, le); const u32 = o => v.getUint32(t + o, le);
          const readAscii = (o, n) => { let out = ''; for (let k = 0; k < n; k++) { const c = v.getUint8(t + o + k); if (!c) break; out += String.fromCharCode(c); } return out; };
          const scan = (ifd, wanted) => {
            const n = u16(ifd); const found = {};
            for (let k = 0; k < n; k++) {
              const e = ifd + 2 + k * 12; const tag = u16(e);
              if (wanted.includes(tag)) found[tag] = tag === 0x8769 ? u32(e + 8) : readAscii(u32(e + 8), 19);
            }
            return found;
          };
          const ifd0 = scan(u32(4), [0x8769, 0x0132]);
          const exif = ifd0[0x8769] ? scan(ifd0[0x8769], [0x9003, 0x9004]) : {};
          const raw = exif[0x9003] || exif[0x9004] || ifd0[0x0132];
          const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2})/);
          if (m) { const r = iso(+m[1], +m[2], +m[3]); if (r) return r; }
          break;
        }
        if ((marker & 0xff00) !== 0xff00) break;
        off += 2 + len;
      }
    }
  } catch { /* not a JPEG with EXIF */ }
  if (file.lastModified) { const d = new Date(file.lastModified); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}

const signed = new Map(); // path -> { url, exp }

const toItem = (row, collectionsById) => ({
  id: row.id,
  owner_id: row.owner_id,
  title: row.title,
  url: row.url || '',
  note: row.note || '',
  category: row.category,
  collection_id: row.collection_id,
  collection: row.collection_id ? collectionsById[row.collection_id]?.name || '' : '',
  image_path: row.image_path || null,
  memory_date: row.memory_date || null,
  created: Date.parse(row.created_at),
});

const BASE_COLS = 'id, owner_id, collection_id, title, url, note, category, created_at';
// Photo columns arrive with the second migration; until a database has it,
// the app keeps working without photos.
// The same applies to memory_date (third migration).
let photosSupported = true;
let datesSupported = true;
const itemCols = () => BASE_COLS + (photosSupported ? ', image_path' : '') + (datesSupported ? ', memory_date' : '');
const missingColumn = (error, col) => error && error.code === '42703' && (error.message || '').includes(col);
async function selectItems(build) {
  let res = await build(itemCols());
  for (let k = 0; k < 2 && res.error?.code === '42703'; k++) {
    if (missingColumn(res.error, 'image_path')) photosSupported = false;
    else if (missingColumn(res.error, 'memory_date')) datesSupported = false;
    else break;
    res = await build(itemCols());
  }
  return res;
}

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
        selectItems(c => supabase.from('items').select(c).eq('owner_id', me).order('created_at', { ascending: false })),
      ]);
      const collections = must(cols);
      const byId = Object.fromEntries(collections.map(c => [c.id, c]));
      return { collections, items: must(items).map(r => toItem(r, byId)) };
    },
    async addItem({ title, url, note, category, collection_id, image_path, memory_date }) {
      const row = { title, url: url || null, note: note || '', category, collection_id: collection_id || null };
      if (image_path) row.image_path = image_path;
      if (memory_date && datesSupported) row.memory_date = memory_date;
      return must(await supabase.from('items').insert(row).select(itemCols()).single());
    },
    async updateItem(id, patch) {
      const row = {};
      if ('collection_id' in patch) row.collection_id = patch.collection_id || null;
      for (const k of ['title', 'note', 'url', 'category', 'image_path']) if (k in patch) row[k] = patch[k];
      if ('memory_date' in patch && datesSupported) row.memory_date = patch.memory_date || null;
      if ('url' in row) row.url = row.url || null;
      must(await supabase.from('items').update(row).eq('id', id));
    },
    async deleteItem(item) {
      must(await supabase.from('items').delete().eq('id', item.id));
      if (item.image_path) await this.releasePhoto(item.image_path);
    },
    async addCollection(name, position) {
      return must(await supabase.from('collections').insert({ name, position }).select('id, name, position').single());
    },
    async renameCollection(id, name) {
      must(await supabase.from('collections').update({ name }).eq('id', id).eq('owner_id', me));
    },
    async deleteCollection(id) {
      must(await supabase.from('collections').delete().eq('id', id).eq('owner_id', me));
    },

    // ---- photos -------------------------------------------------------------
    async uploadPhoto(file) {
      if (!photosSupported) throw new Error('photos_unavailable');
      const blob = await resizeImage(file);
      const path = `${me}/${crypto.randomUUID()}.jpg`;
      must(await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' }));
      return path;
    },
    // Delete a file unless a thought or a world still shows it.
    async releasePhoto(path) {
      if (!path?.startsWith(me + '/')) return;
      const [t, w, i] = await Promise.all([
        supabase.from('thoughts').select('id', { count: 'exact', head: true }).eq('sender_id', me).eq('item_image_path', path),
        supabase.from('world_items').select('id', { count: 'exact', head: true }).eq('added_by', me).eq('image_path', path),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('owner_id', me).eq('image_path', path),
      ]);
      if ((t.count || 0) + (w.count || 0) + (i.count || 0) === 0) await supabase.storage.from('media').remove([path]);
    },
    // Copy a photo someone shared into my own folder (for saved copies).
    async copyPhoto(path) {
      if (!path) return null;
      const dest = `${me}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from('media').copy(path, dest);
      return error ? null : dest;
    },
    async photoUrls(paths) {
      const now = Date.now();
      const missing = [...new Set(paths.filter(Boolean))].filter(p => !(signed.get(p)?.exp > now + 60_000));
      if (missing.length) {
        const { data } = await supabase.storage.from('media').createSignedUrls(missing, 3600);
        (data || []).forEach(d => { if (d.signedUrl) signed.set(d.path, { url: d.signedUrl, exp: now + 3500_000 }); });
      }
      return Object.fromEntries(paths.filter(p => signed.has(p)).map(p => [p, signed.get(p).url]));
    },

    // ---- link previews (server-side fetch, signed-in users only) ------------
    async linkPreview(url) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return res.json();
    },
    // The page's cover image, fetched by our server and returned as a Blob.
    async previewImage(imageUrl) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token || !imageUrl) return null;
      const res = await fetch(`/api/preview-image?url=${encodeURIComponent(imageUrl)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type.startsWith('image/') && blob.size > 0 ? blob : null;
    },
    get photosEnabled() { return photosSupported; },

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
        selectItems(c => supabase.from('items').select(c).eq('owner_id', ownerId).order('created_at', { ascending: false })),
      ]);
      const collections = must(cols);
      const byId = Object.fromEntries(collections.map(c => [c.id, c]));
      return { share: must(share), collections, items: must(items).map(r => toItem(r, byId)) };
    },
    async saveSharedItem(item, collectionId) {
      const id = must(await supabase.rpc('save_shared_item', { p_item: item.id, p_collection: collectionId || null }));
      const copy = await this.copyPhoto(item.image_path);
      if (copy) await supabase.from('items').update({ image_path: copy }).eq('id', id);
      return id;
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
    async saveThought(thought) {
      const id = must(await supabase.rpc('save_thought', { p_thought: thought.id }));
      const copy = await this.copyPhoto(thought.item_image_path);
      if (copy) await supabase.from('items').update({ image_path: copy }).eq('id', id);
      return id;
    },
    async deleteThought(id) { must(await supabase.from('thoughts').delete().eq('id', id)); },

    // ---- our little world ------------------------------------------------
    async loadWorlds() {
      const memberships = must(await supabase.from('world_members').select('world_id, status, role').eq('user_id', me));
      if (!memberships.length) return [];
      const ids = memberships.map(m => m.world_id);
      const [worlds, members, items] = await Promise.all([
        supabase.from('worlds').select('*').in('id', ids).order('created_at', { ascending: false }),
        supabase.from('world_members').select('world_id, user_id, status, role').in('world_id', ids),
        // image_path only once the photo migration exists; the count works either way.
        supabase.from('world_items').select(photosSupported ? 'world_id, image_path, created_at' : 'world_id, created_at').in('world_id', ids).order('created_at', { ascending: false }),
      ]);
      const allMembers = must(members);
      const people = await profilesById([...allMembers.map(m => m.user_id), ...must(worlds).map(w => w.owner_id)]);
      const counts = {}; const covers = {};
      const itemRows = items.error?.code === '42703' ? [] : must(items);
      itemRows.forEach(i => {
        counts[i.world_id] = (counts[i.world_id] || 0) + 1;
        if (i.image_path && (covers[i.world_id] ||= []).length < 4) covers[i.world_id].push(i.image_path);
      });
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
          covers: covers[w.id] || [],
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
      const { data: files } = await supabase.storage.from('media').list(me, { limit: 1000 });
      if (files?.length) await supabase.storage.from('media').remove(files.map(f => `${me}/${f.name}`));
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
