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
export function createLocalApi() {
  const seed = [{ id: uid(), title: 'Scritto a mano', url: '', note: 'Una nuova idea da ricordare.', category: 'Appunti', created: Date.now(), collection: 'Idee' }];
  let items = read('mt_items', seed);
  let collections = read('mt_collections', ['Idee', 'Viaggi', 'Posti da provare']);
  const persist = () => { write('mt_items', items); write('mt_collections', collections); };
  persist();
  const toUi = () => ({
    collections: collections.map(name => ({ id: name, name })),
    items: items.map(i => ({ ...i, collection_id: i.collection })),
  });
  return {
    social: false,
    async loadArchive() { return toUi(); },
    async addItem(it) {
      const item = { id: uid(), title: it.title, url: it.url || '', note: it.note || '', category: it.category, created: Date.now(), collection: it.collection };
      items = [item, ...items]; persist(); return { ...item, collection_id: item.collection };
    },
    async updateItem(id, patch) {
      items = items.map(i => (i.id === id ? { ...i, ...(patch.collection !== undefined ? { collection: patch.collection } : {}) } : i));
      persist();
    },
    async deleteItem(id) { items = items.filter(i => i.id !== id); persist(); },
    async addCollection(name) {
      if (!collections.includes(name)) collections = [...collections, name];
      persist(); return { id: name, name };
    },
    subscribe() { return () => {}; },
  };
}
