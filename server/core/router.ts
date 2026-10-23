// Router HTTP minimale basato sulle Web API standard (Request/Response).
// Lo stesso codice gira in Node.js (server/node/index.ts) e nel browser (demo).

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export type Ctx<U = unknown> = {
  req: Request;
  url: URL;
  params: Record<string, string>;
  user: U | null;
  sessionId: string | null;
  json<T = Record<string, unknown>>(): Promise<T>;
  cookies: Record<string, string>;
  setCookies: string[];
};

export type Handler<U> = (c: Ctx<U>) => Promise<Response> | Response;
type Route<U> = { method: string; parts: string[]; handler: Handler<U> };

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export class Router<U> {
  private routes: Route<U>[] = [];
  constructor(private before?: (c: Ctx<U>) => Promise<void>) {}
  on(method: string, path: string, handler: Handler<U>) { this.routes.push({ method, parts: path.split('/').filter(Boolean), handler }); return this; }
  get(p: string, h: Handler<U>) { return this.on('GET', p, h); }
  post(p: string, h: Handler<U>) { return this.on('POST', p, h); }
  patch(p: string, h: Handler<U>) { return this.on('PATCH', p, h); }
  put(p: string, h: Handler<U>) { return this.on('PUT', p, h); }
  delete(p: string, h: Handler<U>) { return this.on('DELETE', p, h); }

  private match(method: string, pathname: string) {
    const segs = pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = segs[i];
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (!ok) continue;
      if (r.method !== method) { methodMismatch = true; continue; }
      return { route: r, params };
    }
    return { route: null, params: {}, methodMismatch };
  }

  /** opts serve al runtime nel browser, dove gli header Cookie/Set-Cookie non sono accessibili. */
  async handle(req: Request, opts: { cookies?: Record<string, string>; onSetCookie?: (c: string[]) => void } = {}): Promise<Response> {
    const url = new URL(req.url);
    const m = this.match(req.method, url.pathname);
    if (!m.route) return json({ error: m.methodMismatch ? 'Metodo non consentito' : 'Risorsa non trovata' }, m.methodMismatch ? 405 : 404);
    let parsed: unknown;
    const c: Ctx<U> = {
      req, url, params: m.params, user: null, sessionId: null,
      cookies: opts.cookies ?? parseCookies(req.headers.get('cookie')),
      setCookies: [],
      async json<T>() {
        if (parsed !== undefined) return parsed as T;
        const text = await req.text();
        try { parsed = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'JSON non valido'); }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new HttpError(400, 'Corpo richiesta non valido');
        return parsed as T;
      },
    };
    try {
      if (this.before) await this.before(c);
      const res = await m.route.handler(c);
      if (c.setCookies.length) opts.onSetCookie?.(c.setCookies);
      for (const ck of c.setCookies) res.headers.append('Set-Cookie', ck);
      return res;
    } catch (e) {
      if (e instanceof HttpError) {
        const res = json({ error: e.message, details: e.details }, e.status);
        for (const ck of c.setCookies) res.headers.append('Set-Cookie', ck);
        return res;
      }
      console.error('[myshowroom] errore non gestito', req.method, url.pathname, e);
      return json({ error: 'Errore interno del server' }, 500);
    }
  }
}
