// Interfaccia di persistenza indipendente dal runtime.
// In produzione: PostgreSQL (server/node/pgStore.ts). Nella demo nel browser: IndexedDB (src/demo/memoryStore.ts).

export type Row = Record<string, unknown> & { id: string };
export type Where = Record<string, string | number | boolean | null>;

export const TABLES = {
  users: { json: [] },
  sessions: { json: [] },
  products: { json: ['images', 'materials', 'colors', 'configs'] },
  files: { json: [] },
  documents: { json: [] },
  documentProducts: { json: [] },
  clients: { json: [] },
  quotes: { json: [] },
  quoteItems: { json: [] },
  appointments: { json: [] },
  tasks: { json: [] },
  reservations: { json: [] },
  emails: { json: ['attachments'] },
  settings: { json: [] },
} as const;
export type Table = keyof typeof TABLES;

/** Vincoli di unicità applicati sia dal database sia dallo store in memoria. */
export const UNIQUE: Partial<Record<Table, string[][]>> = {
  users: [['email']],
  documentProducts: [['documentId', 'productId']],
  appointments: [['site', 'date', 'time']],
  reservations: [['productId']],
  quotes: [['number']],
};

export class UniqueViolation extends Error {
  constructor(public table: string, public columns: string[]) { super(`unique violation on ${table}(${columns.join(',')})`); }
}

export interface Store {
  all<T = Row>(table: Table, where?: Where, orderBy?: string): Promise<T[]>;
  get<T = Row>(table: Table, id: string): Promise<T | null>;
  find<T = Row>(table: Table, where: Where): Promise<T | null>;
  insert<T = Row>(table: Table, row: Row): Promise<T>;
  update<T = Row>(table: Table, id: string, patch: Record<string, unknown>): Promise<T | null>;
  remove(table: Table, where: Where): Promise<number>;
  count(table: Table, where?: Where): Promise<number>;
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T>;
}

/** "createdAt desc" → [campo, direzione] */
export function parseOrder(orderBy?: string): [string, 'asc' | 'desc'] | null {
  if (!orderBy) return null;
  const [f, d] = orderBy.trim().split(/\s+/);
  if (!/^[a-zA-Z]+$/.test(f)) throw new Error('invalid order field');
  return [f, d?.toLowerCase() === 'desc' ? 'desc' : 'asc'];
}
