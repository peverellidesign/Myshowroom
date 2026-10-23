// Store PostgreSQL (driver postgres.js, zero dipendenze).
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { parseOrder, TABLES, UniqueViolation, type Row, type Store, type Table, type Where } from '../core/store';

type Sql = postgres.Sql | postgres.TransactionSql;
const snake = (s: string) => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const tableName = (t: Table) => snake(t);

function fromDb<T>(r: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[camel(k)] = v instanceof Date ? v.toISOString() : v;
  return o as T;
}

function wrapError(table: Table, e: unknown): never {
  const err = e as { code?: string; constraint_name?: string };
  if (err?.code === '23505') throw new UniqueViolation(table, [err.constraint_name || '']);
  throw e;
}

function make(sql: Sql, root: postgres.Sql): Store {
  const toDb = (table: Table, row: Record<string, unknown>) => {
    const jsonCols = TABLES[table].json as readonly string[];
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === undefined) continue;
      o[snake(k)] = jsonCols.includes(k) ? root.json(v as postgres.JSONValue) : v;
    }
    return o;
  };
  const whereSql = (where: Where = {}) => {
    const parts = Object.entries(where).map(([k, v]) => v === null ? sql`${sql(snake(k))} is null` : sql`${sql(snake(k))} = ${v}`);
    return parts.length ? parts.reduce((a, b) => sql`${a} and ${b}`) : sql`true`;
  };
  const store: Store = {
    async all<T>(table: Table, where?: Where, orderBy?: string) {
      const o = parseOrder(orderBy);
      const order = o ? sql`order by ${sql(snake(o[0]))} ${o[1] === 'desc' ? sql`desc nulls last` : sql`asc`}` : sql``;
      const rows = await sql`select * from ${sql(tableName(table))} where ${whereSql(where)} ${order}`;
      return rows.map(r => fromDb<T>(r));
    },
    async get<T>(table: Table, id: string) {
      const [r] = await sql`select * from ${sql(tableName(table))} where id = ${id}`;
      return r ? fromDb<T>(r) : null;
    },
    async find<T>(table: Table, where: Where) {
      const [r] = await sql`select * from ${sql(tableName(table))} where ${whereSql(where)} limit 1`;
      return r ? fromDb<T>(r) : null;
    },
    async insert<T>(table: Table, row: Row) {
      try {
        const data = toDb(table, row);
        const [r] = await sql`insert into ${sql(tableName(table))} ${sql(data as never, Object.keys(data))} returning *`;
        return fromDb<T>(r);
      } catch (e) { wrapError(table, e); }
    },
    async update<T>(table: Table, id: string, patch: Record<string, unknown>) {
      const data = toDb(table, patch);
      delete data.id;
      if (!Object.keys(data).length) return store.get<T>(table, id);
      try {
        const [r] = await sql`update ${sql(tableName(table))} set ${sql(data as never, Object.keys(data))} where id = ${id} returning *`;
        return r ? fromDb<T>(r) : null;
      } catch (e) { wrapError(table, e); }
    },
    async remove(table: Table, where: Where) {
      if (!Object.keys(where).length) throw new Error('remove senza condizioni non consentito');
      const r = await sql`delete from ${sql(tableName(table))} where ${whereSql(where)}`;
      return r.count;
    },
    async count(table: Table, where?: Where) {
      const [r] = await sql`select count(*)::int as n from ${sql(tableName(table))} where ${whereSql(where)}`;
      return r.n as number;
    },
    async tx<T>(fn: (s: Store) => Promise<T>): Promise<T> {
      if ('savepoint' in sql && sql !== root) return fn(store); // già in transazione
      return root.begin(t => fn(make(t, root))) as Promise<T>;
    },
  };
  return store;
}

export async function createPgStore(url: string, schemaPath: string) {
  const root = postgres(url, { max: Number(process.env.DB_POOL_MAX || 10), onnotice: () => {}, idle_timeout: 30, ssl: process.env.DB_SSL === 'require' ? 'require' : undefined });
  await root.unsafe(readFileSync(schemaPath, 'utf8'));
  return { store: make(root, root), close: () => root.end({ timeout: 5 }) };
}
