// Store della demo: stesse semantiche dello store PostgreSQL, dati persistiti in IndexedDB del browser.
import { parseOrder, TABLES, UNIQUE, UniqueViolation, type Row, type Store, type Table, type Where } from '../../server/core/store';

type State = Record<string, Row[]>;
const DB_NAME = 'myshowroom-demo';

function idb(): Promise<IDBDatabase | null> {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb(); if (!db) return undefined;
  return new Promise(res => { try { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result as T); q.onerror = () => res(undefined); } catch { res(undefined); } });
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb(); if (!db) return;
  return new Promise(res => { try { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = () => res(); t.onerror = () => res(); } catch { res(); } });
}
export async function idbDel(key: string): Promise<void> {
  const db = await idb(); if (!db) return;
  return new Promise(res => { try { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = () => res(); t.onerror = () => res(); } catch { res(); } });
}

const clone = <T>(v: T): T => structuredClone(v);
const matches = (r: Row, where: Where = {}) => Object.entries(where).every(([k, v]) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v));

export async function createMemoryStore(): Promise<Store & { reset(): Promise<void> }> {
  let state: State = (await idbGet<State>('tables')) || {};
  for (const t of Object.keys(TABLES)) state[t] ||= [];
  let timer: number | undefined;
  const persist = () => { window.clearTimeout(timer); timer = window.setTimeout(() => idbSet('tables', state), 150); };

  const checkUnique = (table: Table, row: Row) => {
    for (const cols of UNIQUE[table] || []) {
      if (cols.some(c => row[c] === null || row[c] === undefined)) continue;
      if (state[table].some(r => r.id !== row.id && cols.every(c => r[c] === row[c]))) throw new UniqueViolation(table, cols);
    }
  };
  const store: Store & { reset(): Promise<void> } = {
    async all<T>(table: Table, where?: Where, orderBy?: string) {
      const rows = state[table].filter(r => matches(r, where)).map(clone);
      const o = parseOrder(orderBy);
      if (o) {
        const [f, d] = o;
        rows.sort((a, b) => {
          const x = a[f] as never, y = b[f] as never;
          if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
          return (x < y ? -1 : x > y ? 1 : 0) * (d === 'desc' ? -1 : 1);
        });
      }
      return rows as T[];
    },
    async get<T>(table: Table, id: string) { const r = state[table].find(x => x.id === id); return r ? clone(r) as T : null; },
    async find<T>(table: Table, where: Where) { const r = state[table].find(x => matches(x, where)); return r ? clone(r) as T : null; },
    async insert<T>(table: Table, row: Row) {
      const r = clone(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined))) as Row;
      checkUnique(table, r); state[table].push(r); persist(); return clone(r) as T;
    },
    async update<T>(table: Table, id: string, patch: Record<string, unknown>) {
      const i = state[table].findIndex(x => x.id === id); if (i < 0) return null;
      const next = { ...state[table][i], ...clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), id } as Row;
      checkUnique(table, next); state[table][i] = next; persist(); return clone(next) as T;
    },
    async remove(table: Table, where: Where) {
      const before = state[table].length; state[table] = state[table].filter(r => !matches(r, where)); persist(); return before - state[table].length;
    },
    async count(table: Table, where?: Where) { return state[table].filter(r => matches(r, where)).length; },
    async tx<T>(fn: (s: Store) => Promise<T>) {
      const snapshot = clone(state);
      try { return await fn(store); } catch (e) { state = snapshot; persist(); throw e; }
    },
    async reset() { state = {}; for (const t of Object.keys(TABLES)) state[t] = []; await idbSet('tables', state); },
  };
  return store;
}
