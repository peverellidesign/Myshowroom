// On-device storage used by the original prototype (keys mt_*).
// Used (a) as the store in local-only mode when no backend is configured and
// (b) as the source for the consent-based import into a new account.

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};
const uid = () => crypto.randomUUID();

// mt_notes (thoughts shared outside morethere) stays on the device.
export const LEGACY_KEYS = ['mt_items', 'mt_collections', 'mt_worlds', 'mt_connections'];

export function readLegacy() {
  const items = read('mt_items', null);
  if (!Array.isArray(items) || !items.length) return null;
  return {
    items,
    collections: read('mt_collections', []),
    worlds: read('mt_worlds', []),
  };
}

export function clearLegacy() {
  LEGACY_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
}

// Local-only implementation of the personal-archive part of the API.
// Photos are stored as small data URLs (localStorage holds only a few MB).
export function createLocalApi() {
  const seed = [{ id: uid(), title: 'Scritto a mano', url: '', note: 'Una nuova idea da ricordare.', category: 'Appunti', created: Date.now(), collection: 'Idee' }];
  let items = read('mt_items', seed);
  let collections = read('mt_collections', ['Idee', 'Viaggi', 'Posti da provare']);
  const persist = () => { write('mt_items', items); write('mt_collections', collections); };
  persist();
  const toUi = () => ({
    collections: collections.map(name => ({ id: name, name })),
    items: items.map(i => ({ ...i, collection_id: i.collection, image_path: i.image || null })),
  });
  return {
    social: false,
    async loadArchive() { return toUi(); },
    async addItem(it) {
      const item = { id: uid(), title: it.title, url: it.url || '', note: it.note || '', category: it.category, created: Date.now(), collection: it.collection, image: it.image_path || undefined };
      items = [item, ...items]; persist(); return item;
    },
    async updateItem(id, patch) {
      items = items.map(i => {
        if (i.id !== id) return i;
        const n = { ...i };
        if (patch.collection !== undefined) n.collection = patch.collection;
        for (const k of ['title', 'note', 'url', 'category']) if (k in patch) n[k] = patch[k];
        if ('image_path' in patch) n.image = patch.image_path || undefined;
        return n;
      });
      persist();
    },
    async deleteItem(item) { items = items.filter(i => i.id !== item.id); persist(); },
    async addCollection(name) {
      if (!collections.includes(name)) collections = [...collections, name];
      persist(); return { id: name, name };
    },
    async renameCollection(id, name) {
      collections = collections.map(c => (c === id ? name : c));
      items = items.map(i => (i.collection === id ? { ...i, collection: name } : i));
      persist();
    },
    async deleteCollection(id) {
      collections = collections.filter(c => c !== id);
      items = items.map(i => (i.collection === id ? { ...i, collection: '' } : i));
      persist();
    },
    async uploadPhoto(file) {
      const { resizeImage } = await import('./api.js');
      const blob = await resizeImage(file, 900, 0.72);
      return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
    },
    async photoUrls(paths) { return Object.fromEntries(paths.filter(Boolean).map(p => [p, p])); },
    async linkPreview() { return null; },
    subscribe() { return () => {}; },
  };
}
