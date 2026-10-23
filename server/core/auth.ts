// Password (PBKDF2-SHA256 via WebCrypto) e sessioni opache con cookie HttpOnly.
import type { Role, User } from '../../shared/types';
import type { Store } from './store';
import { HttpError, type Ctx } from './router';

const ITERATIONS = 210_000;
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map(x => parseInt(x, 16)));

export const SESSION_COOKIE = 'ms_session';
export const SESSION_DAYS = 14;

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, it, saltHex, hashHex] = (stored || '').split('$');
  if (algo !== 'pbkdf2' || !saltHex || !hashHex) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: Number(it) }, key, 256));
  const expected = fromHex(hashHex);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

export async function sha256(s: string) { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export const randomToken = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

export type DbUser = User & { passwordHash: string };
export const publicUser = (u: DbUser): User => ({ id: u.id, email: u.email, name: u.name, role: u.role, site: u.site, active: u.active, createdAt: u.createdAt });

export async function createSession(store: Store, userId: string, userAgent: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await store.insert('sessions', { id: await sha256(token), userId, expiresAt, userAgent: userAgent.slice(0, 200), createdAt: new Date().toISOString() });
  return { token, expiresAt };
}

export function sessionCookie(token: string, secure: boolean, maxAgeSec = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

/** Carica l'utente dalla sessione (cookie). */
export async function loadUser(store: Store, c: Ctx<DbUser>) {
  const token = c.cookies[SESSION_COOKIE];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return;
  const id = await sha256(token);
  const s = await store.get<{ id: string; userId: string; expiresAt: string }>('sessions', id);
  if (!s) return;
  if (new Date(s.expiresAt).getTime() < Date.now()) { await store.remove('sessions', { id }); return; }
  const u = await store.get<DbUser>('users', s.userId);
  if (!u || !u.active) return;
  c.user = u;
  c.sessionId = id;
}

export function requireUser(c: Ctx<DbUser>, ...roles: Role[]): DbUser {
  if (!c.user) throw new HttpError(401, 'Accesso richiesto');
  if (roles.length && !roles.includes(c.user.role)) throw new HttpError(403, 'Permessi insufficienti per questa operazione');
  return c.user;
}

export const canManage = (u: DbUser) => u.role === 'admin' || u.role === 'manager';

/** Limite tentativi di login (in memoria, per istanza). */
const attempts = new Map<string, { n: number; until: number }>();
export function checkRateLimit(key: string, max = 8, windowMs = 15 * 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= max) throw new HttpError(429, 'Troppi tentativi. Riprova tra qualche minuto.');
  if (!a || a.until <= now) attempts.set(key, { n: 1, until: now + windowMs });
  else a.n++;
}
export const clearRateLimit = (key: string) => attempts.delete(key);
