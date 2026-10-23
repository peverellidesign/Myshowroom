// Store via API HTTPS di Supabase (PostgREST), per host che consentono solo traffico web in uscita
// (es. GoDaddy Node.js Hosting: niente connessioni dirette su 5432/6543).
// Stesse semantiche di pgStore, tranne le transazioni: ogni operazione è atomica da sola.
import { parseOrder, UniqueViolation, type Row, type Store, type Table, type Where } from '../core/store';

const snake = (s: string) => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const PAGE = 1000;

export type SupabaseConfig = { restUrl: string; key: string };

export function createSupabaseStore(cfg: SupabaseConfig): Store {
  const base = cfg.restUrl.replace(/\/$/, '');
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: cfg.key,
    // chiavi legacy (JWT "service_role"): anche come Bearer; le nuove chiavi sb_secret_ solo come apikey
    ...(cfg.key.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.key}` } : {}),
    'Content-Type': 'application/json', Accept: 'application/json', ...extra,
  });
  const tableUrl = (t: Table) => `${base}/${snake(t)}`;
  const filters = (where: Where = {}) => Object.entries(where).map(([k, v]) => `${encodeURIComponent(snake(k))}=${v === null ? 'is.null' : 'eq.' + encodeURIComponent(String(v))}`);
  const fromDb = <T>(r: Record<string, unknown>): T => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = camel(k);
      o[key] = typeof v === 'string' && key.endsWith('At') && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString() : v;
    }
    return o as T;
  };
  const toDb = (row: Record<string, unknown>) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) if (v !== undefined) o[snake(k)] = v;
    return o;
  };
  async function call(table: Table, method: string, query: string[], init: { body?: unknown; headers?: Record<string, string> } = {}) {
    const url = tableUrl(table) + (query.length ? '?' + query.join('&') : '');
    const r = await fetch(url, { method, headers: headers(init.headers), body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) {
      const err = await r.json().catch(() => ({})) as { code?: string; message?: string; details?: string };
      if (err.code === '23505') throw new UniqueViolation(table, [err.details || err.message || '']);
      throw new Error(`Supabase ${method} ${table}: ${r.status} ${err.code || ''} ${err.message || ''}`.trim());
    }
    return r;
  }
  const total = (r: Response) => Number((r.headers.get('content-range') || '*/0').split('/')[1]) || 0;

  const store: Store = {
    async all<T>(table: Table, where?: Where, orderBy?: string) {
      const q = ['select=*', ...filters(where)];
      const o = parseOrder(orderBy);
      if (o) q.push(`order=${snake(o[0])}.${o[1]}${o[1] === 'desc' ? '.nullslast' : ''}`);
      const out: T[] = [];
      for (let from = 0; ; from += PAGE) {
        const r = await call(table, 'GET', q, { headers: { 'Range-Unit': 'items', Range: `${from}-${from + PAGE - 1}` } });
        const rows = await r.json() as Record<string, unknown>[];
        out.push(...rows.map(x => fromDb<T>(x)));
        if (rows.length < PAGE) break;
      }
      return out;
    },
    async get<T>(table: Table, id: string) { return store.find<T>(table, { id }); },
    async find<T>(table: Table, where: Where) {
      const r = await call(table, 'GET', ['select=*', ...filters(where), 'limit=1']);
      const [row] = await r.json() as Record<string, unknown>[];
      return row ? fromDb<T>(row) : null;
    },
    async insert<T>(table: Table, row: Row) {
      const r = await call(table, 'POST', ['select=*'], { body: toDb(row), headers: { Prefer: 'return=representation' } });
      const [out] = await r.json() as Record<string, unknown>[];
      return fromDb<T>(out);
    },
    async update<T>(table: Table, id: string, patch: Record<string, unknown>) {
      const data = toDb(patch); delete data.id;
      if (!Object.keys(data).length) return store.get<T>(table, id);
      const r = await call(table, 'PATCH', ['select=*', ...filters({ id })], { body: data, headers: { Prefer: 'return=representation' } });
      const [out] = await r.json() as Record<string, unknown>[];
      return out ? fromDb<T>(out) : null;
    },
    async remove(table: Table, where: Where) {
      if (!Object.keys(where).length) throw new Error('remove senza condizioni non consentito');
      return total(await call(table, 'DELETE', filters(where), { headers: { Prefer: 'return=minimal, count=exact' } }));
    },
    async count(table: Table, where?: Where) {
      return total(await call(table, 'HEAD', filters(where), { headers: { Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }));
    },
    // L'API HTTPS non espone transazioni: le operazioni restano sequenziali; i vincoli di unicità
    // restano garantiti dal database (numerazione preventivi, fasce orarie, riserve).
    async tx<T>(fn: (s: Store) => Promise<T>) { return fn(store); },
  };
  return store;
}

/** Verifica che lo schema sia stato creato (server/schema.sql nel SQL Editor di Supabase). */
export async function checkSupabaseSchema(cfg: SupabaseConfig): Promise<string | null> {
  try {
    const r = await fetch(`${cfg.restUrl.replace(/\/$/, '')}/users?select=id&limit=1`, { headers: { apikey: cfg.key, ...(cfg.key.startsWith('eyJ') ? { Authorization: `Bearer ${cfg.key}` } : {}) }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) return null;
    const e = await r.json().catch(() => ({})) as { code?: string; message?: string };
    if (r.status === 401 || r.status === 403) return 'Chiave Supabase non valida: usa la "secret key" (o service_role) del progetto.';
    if (e.code === 'PGRST205' || e.code === '42P01' || r.status === 404) return 'Tabelle non trovate: esegui una volta il file server/schema.sql nel SQL Editor di Supabase.';
    return `Supabase ha risposto ${r.status}: ${e.message || ''}`;
  } catch (err) {
    return `Supabase non raggiungibile: ${(err as Error).message}`;
  }
}
