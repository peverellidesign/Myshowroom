// API di myshowroom by Peverelli Design — indipendente dal runtime.
import {
  APPT_DURATIONS, APPT_TIMES, APPT_TYPES, CATEGORIES, DOC_LANGS, DOC_TYPES, LOCATIONS, ROLES, SHOWROOMS, STATUSES,
  convert, formatMoney, isEmail, quoteTotal,
  type Appointment, type Bootstrap, type Client, type Config, type Currency, type DocumentRecord, type EmailAttachment,
  type EmailRecord, type FileRecord, type Product, type Quote, type QuoteItem, type Reservation, type Role, type Task, type User,
} from '../../shared/types';
import { ask } from './assistant';
import {
  canManage, checkRateLimit, clearRateLimit, createSession, hashPassword, loadUser, publicUser, requireUser, SESSION_COOKIE,
  sessionCookie, sha256, verifyPassword, type DbUser,
} from './auth';
import type { Deps, MailAttachment } from './deps';
import { appointmentIcs } from './ics';
import { renderQuotePdf } from './pdf';
import { HttpError, json, Router, type Ctx } from './router';
import { UniqueViolation, type Store } from './store';

type C = Ctx<DbUser>;
const now = () => new Date().toISOString();
const LINK_DAYS = 60;
const uid = () => crypto.randomUUID();

// ───────────── validazione ─────────────
function str(v: unknown, label: string, { max = 500, required = false, def = '' } = {}): string {
  if (v === undefined || v === null) { if (required) throw new HttpError(400, `${label}: campo obbligatorio`); return def; }
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${label}: valore non valido`);
  const s = String(v).trim();
  if (required && !s) throw new HttpError(400, `${label}: campo obbligatorio`);
  if (s.length > max) throw new HttpError(400, `${label}: massimo ${max} caratteri`);
  return s;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], label: string, def?: T): T {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  if (!list.includes(v as T)) throw new HttpError(400, `${label}: valore non ammesso`);
  return v as T;
}
function num(v: unknown, label: string, { min = 0, max = 1e9, optional = false } = {}): number | undefined {
  if ((v === undefined || v === null || v === '') && optional) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label}: numero non valido`);
  return n;
}
function strList(v: unknown, label: string, max = 30): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, `${label}: elenco non valido`);
  return v.map(x => str(x, label, { max: 2000, required: true }));
}
const email = (v: unknown, label = 'Email', required = false) => {
  const s = str(v, label, { max: 254, required });
  if (s && !isEmail(s)) throw new HttpError(400, `${label}: indirizzo non valido`);
  return s.toLowerCase();
};
const dateStr = (v: unknown, label = 'Data') => { const s = str(v, label, { required: true, max: 10 }); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new HttpError(400, `${label}: formato non valido`); return s; };

function configs(v: unknown): Config[] {
  if (!Array.isArray(v) || !v.length || v.length > 30) throw new HttpError(400, 'Composizioni: almeno una richiesta');
  return v.map((c: Record<string, unknown>) => {
    const out: Config = { name: str(c?.name, 'Nome composizione', { required: true, max: 120 }), dims: str(c?.dims, 'Misure composizione', { max: 120, def: 'Da verificare' }) || 'Da verificare' };
    const p = num(c?.price, 'Prezzo composizione', { optional: true, max: 1e8 });
    if (p !== undefined) out.price = p;
    const lp = num(c?.listPrice, 'Prezzo di listino', { optional: true, max: 1e8 });
    if (lp !== undefined) out.listPrice = lp;
    return out;
  });
}

// ───────────── app ─────────────
export function createApp(deps: Deps) {
  const { store, storage, mailer, config } = deps;
  const clock = () => (deps.now ? deps.now() : new Date());

  const router = new Router<DbUser>(async c => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.headers.get('x-requested-with') !== 'myshowroom')
      throw new HttpError(403, 'Richiesta non autorizzata (CSRF)');
    await loadUser(store, c);
  });

  // ── helpers dati ──
  const liveStatus = (p: Product, res: Reservation[]) => res.some(r => r.productId === p.id) ? 'Riservato' : p.status;
  async function documentsAll(s: Store = store): Promise<DocumentRecord[]> {
    const [docs, links, files] = await Promise.all([s.all<DocumentRecord>('documents', {}, 'createdAt asc'), s.all<{ documentId: string; productId: string }>('documentProducts'), s.all<FileRecord>('files')]);
    return docs.map(d => {
      const f = d.fileId ? files.find(x => x.id === d.fileId) : null;
      return { ...d, fileName: f?.fileName ?? null, size: f?.size ?? null, productIds: links.filter(l => l.documentId === d.id).map(l => l.productId) };
    });
  }
  async function hydrateQuote(q: Quote, s: Store = store): Promise<Quote> {
    const items = (await s.all<QuoteItem>('quoteItems', { quoteId: q.id }, 'position asc'));
    const client = q.clientId ? await s.get<Client>('clients', q.clientId) : null;
    const author = await s.get<DbUser>('users', q.createdBy);
    const email = await s.all<EmailRecord>('emails', { quoteId: q.id }, 'createdAt desc');
    return { ...q, items, total: q.status === 'draft' ? quoteTotal(items, q.currency, q.rate) : q.total, clientName: client?.name, createdByName: author?.name, emailStatus: email[0]?.status ?? null };
  }
  async function currentDraft(u: DbUser): Promise<Quote> {
    const existing = (await store.all<Quote>('quotes', { createdBy: u.id, status: 'draft' }, 'createdAt desc'))[0];
    if (existing) return hydrateQuote(existing);
    const firstClient = (await store.all<Client>('clients', {}, 'createdAt asc'))[0];
    const q = await store.insert<Quote>('quotes', {
      id: uid(), number: null, clientId: firstClient?.id ?? null, status: 'draft', currency: 'CHF', rate: 0.93, showPrices: true,
      subject: 'La sua proposta Peverelli Design',
      body: 'Gentile Cliente,\n\nLa ringraziamo per la visita presso il nostro showroom.\n\nLe condividiamo il riepilogo dei prodotti selezionati.\n\nCordiali saluti,\nPeverelli Design',
      total: 0, pdfFileId: null, createdBy: u.id, createdAt: now(), sentAt: null,
    });
    return hydrateQuote(q);
  }
  async function ownQuote(c: C, id: string, draftOnly = true) {
    const u = requireUser(c);
    const q = await store.get<Quote>('quotes', id);
    if (!q) throw new HttpError(404, 'Preventivo non trovato');
    if (q.createdBy !== u.id && !canManage(u)) throw new HttpError(403, 'Preventivo di un altro consulente');
    if (draftOnly && q.status !== 'draft') throw new HttpError(409, 'Il preventivo è già stato inviato');
    return q;
  }
  async function saveFile(data: Uint8Array, fileName: string, mime: string, userId: string | null): Promise<FileRecord> {
    const id = uid();
    const ext = (fileName.match(/\.[a-z0-9]{1,5}$/i)?.[0] || '').toLowerCase();
    const key = `${new Date().getFullYear()}/${id}${ext}`;
    await storage.put(key, data, mime);
    return store.insert<FileRecord>('files', { id, storageKey: key, fileName, mime, size: data.byteLength, createdBy: userId, createdAt: now() });
  }
  async function readFile(id: string) {
    const f = await store.get<FileRecord & { storageKey: string }>('files', id);
    if (!f) return null;
    const data = await storage.get(f.storageKey);
    return data ? { file: f, data } : null;
  }
  async function loadImage(url: string) {
    const m = url.match(/^\/api\/files\/([0-9a-f-]{36})$/);
    if (m) { const r = await readFile(m[1]); return r ? { data: r.data, mime: r.file.mime } : null; }
    if (/^https?:\/\//.test(url) && deps.fetchImage) return deps.fetchImage(url).catch(() => null);
    return null;
  }
  async function quotePdf(q: Quote, u: DbUser) {
    const client = q.clientId ? await store.get<Client>('clients', q.clientId) : null;
    const author = (await store.get<DbUser>('users', q.createdBy)) ?? u;
    const images: Record<string, { data: Uint8Array; mime: string } | null> = {};
    for (const it of q.items) {
      if (it.productId in images) continue;
      const p = await store.get<Product>('products', it.productId);
      images[it.productId] = p?.images[0] ? await loadImage(p.images[0]) : null;
    }
    return renderQuotePdf({ quote: q, client, author: publicUser(author), images, sites: 'Como · Milano Brera · Lugano · Dubai', date: q.sentAt ? new Date(q.sentAt) : clock() });
  }
  const quoteText = (q: Quote, showPrices: boolean) => q.items.map((x, i) =>
    `${i + 1}. ${x.brand} — ${x.productName}\n${x.config} · ${x.dims}\n${x.material} / ${x.color}${showPrices ? '\n' + formatMoney(convert(x.price, x.currency, q.currency, q.rate), q.currency) : ''}`).join('\n\n');
  const htmlEscape = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
  const brandedHtml = (text: string) => `<!doctype html><html><body style="margin:0;background:#fafaf8;font-family:Inter,Arial,Helvetica,sans-serif;color:#171717">
<div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e8e8e4;border-radius:12px;padding:32px">
<div style="font-size:23px;font-weight:500;letter-spacing:-1px">myshowroom</div><div style="font-size:11px;color:#888882;margin-bottom:28px">by Peverelli Design</div>
<div style="font-size:14px;line-height:1.65;white-space:pre-wrap">${htmlEscape(text)}</div></div>
<div style="font-size:10px;letter-spacing:1px;color:#aaa;padding:18px 4px">© PEVERELLI DESIGN · COMO · MILANO BRERA · LUGANO · DUBAI</div></div></body></html>`;

  async function sendAndLog(u: DbUser | null, to: string, subject: string, text: string, attachments: (MailAttachment & { fileId: string })[], refs: { quoteId?: string; appointmentId?: string }) {
    const result = await mailer.send({ to, subject, text, html: brandedHtml(text), replyTo: u?.email, attachments });
    const rec = await store.insert<EmailRecord>('emails', {
      id: uid(), to, subject, body: text,
      attachments: attachments.map<EmailAttachment>(a => ({ fileId: a.fileId, fileName: a.filename, size: a.content.byteLength })),
      status: result.status, error: result.error ?? null, messageId: result.messageId ?? null,
      quoteId: refs.quoteId ?? null, appointmentId: refs.appointmentId ?? null, sentBy: u?.id ?? null, createdAt: now(),
    });
    return rec;
  }

  // ── link firmati per scaricare file senza login (allegati troppo grandi per l'email) ──
  const enc = new TextEncoder();
  async function sign(data: string) {
    const key = await crypto.subtle.importKey('raw', enc.encode(config.linkSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function signedFileUrl(fileId: string, origin: string) {
    const exp = Math.floor(clock().getTime() / 1000) + LINK_DAYS * 86400;
    return `${(config.publicUrl || origin).replace(/\/$/, '')}/api/public/files/${fileId}?exp=${exp}&sig=${await sign(`${fileId}.${exp}`)}`;
  }
  router.get('/api/public/files/:id', async c => {
    const exp = Number(c.url.searchParams.get('exp')), sig = c.url.searchParams.get('sig') || '';
    if (!exp || exp * 1000 < Date.now() || sig !== await sign(`${c.params.id}.${exp}`)) throw new HttpError(403, 'Link scaduto o non valido');
    const r = await readFile(c.params.id);
    if (!r) throw new HttpError(404, 'File non trovato');
    return new Response(r.data as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': r.file.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(r.file.fileName)}`, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  });

  // ───────────── health & auth ─────────────
  router.get('/api/health', async () => json({ ok: true, storage: storage.kind, mail: mailer.mode, time: now() }));

  router.post('/api/auth/login', async c => {
    const b = await c.json<{ email?: string; password?: string }>();
    const e = email(b.email, 'Email', true);
    const ip = c.req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
    checkRateLimit(`login:${e}:${ip}`);
    const u = await store.find<DbUser>('users', { email: e });
    const ok = u && u.active && await verifyPassword(str(b.password, 'Password', { required: true, max: 200 }), u.passwordHash);
    if (!ok || !u) throw new HttpError(401, 'Email o password non corretti');
    clearRateLimit(`login:${e}:${ip}`);
    const { token } = await createSession(store, u.id, c.req.headers.get('user-agent') || '');
    c.setCookies.push(sessionCookie(token, config.secureCookies));
    return json({ user: publicUser(u) });
  });
  router.post('/api/auth/logout', async c => {
    if (c.sessionId) await store.remove('sessions', { id: c.sessionId });
    c.setCookies.push(sessionCookie('', config.secureCookies, 0));
    return json({ ok: true });
  });
  router.get('/api/auth/me', async c => json({ user: c.user ? publicUser(c.user) : null }));
  router.post('/api/auth/password', async c => {
    const u = requireUser(c);
    const b = await c.json<{ current?: string; next?: string }>();
    if (!(await verifyPassword(str(b.current, 'Password attuale', { required: true, max: 200 }), u.passwordHash))) throw new HttpError(400, 'La password attuale non è corretta');
    const next = str(b.next, 'Nuova password', { required: true, max: 200 });
    if (next.length < 10) throw new HttpError(400, 'La nuova password deve avere almeno 10 caratteri');
    await store.update('users', u.id, { passwordHash: await hashPassword(next) });
    // invalida le altre sessioni
    for (const s of await store.all<{ id: string }>('sessions', { userId: u.id })) if (s.id !== c.sessionId) await store.remove('sessions', { id: s.id });
    return json({ ok: true });
  });

  // ───────────── bootstrap ─────────────
  router.get('/api/bootstrap', async c => {
    const u = requireUser(c);
    const [users, products, documents, clients, quote, appointments, tasks, reservations] = await Promise.all([
      store.all<DbUser>('users', { active: true }, 'name asc'), store.all<Product>('products', {}, 'createdAt asc'), documentsAll(),
      store.all<Client>('clients', {}, 'createdAt asc'), currentDraft(u), store.all<Appointment>('appointments', {}, 'date asc'),
      store.all<Task>('tasks', {}, 'createdAt asc'), store.all<Reservation>('reservations', {}, 'createdAt asc'),
    ]);
    appointments.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const body: Bootstrap = {
      user: publicUser(u), users: users.map(x => ({ id: x.id, name: x.name, role: x.role, site: x.site })),
      products, documents, clients, quote, appointments, tasks, reservations,
      config: { mailMode: mailer.mode, storage: storage.kind, assistant: deps.llm ? 'llm' : 'local', maxUploadMb: config.maxUploadMb, demo: config.demo },
    };
    return json(body);
  });

  // ───────────── prodotti ─────────────
  function productInput(b: Record<string, unknown>, partial: boolean) {
    const out: Record<string, unknown> = {};
    const has = (k: string) => !partial || k in b;
    if (has('brand')) out.brand = str(b.brand, 'Brand', { required: true, max: 80 });
    if (has('name')) out.name = str(b.name, 'Modello', { required: true, max: 120 });
    if (has('category')) out.category = oneOf(b.category, CATEGORIES, 'Categoria');
    if (has('location')) out.location = oneOf(b.location, LOCATIONS, 'Sede');
    if (has('zone')) out.zone = str(b.zone, 'Zona', { max: 80 });
    if (has('status')) out.status = oneOf(b.status, STATUSES, 'Stato');
    if (has('currency')) out.currency = oneOf(b.currency, ['CHF', 'EUR'] as const, 'Valuta');
    if (has('dims')) out.dims = str(b.dims, 'Dimensioni', { max: 120 }) || 'Da verificare';
    if (has('description')) out.description = str(b.description, 'Descrizione', { max: 4000 });
    if (has('images')) out.images = strList(b.images, 'Immagini', 24).map(s => { if (!/^(https:\/\/|\/api\/files\/)/.test(s)) throw new HttpError(400, 'Immagini: usare un link https o un file caricato'); return s; });
    if (has('materials')) out.materials = strList(b.materials, 'Materiali');
    if (has('colors')) out.colors = strList(b.colors, 'Colori');
    if (has('configs')) out.configs = configs(b.configs);
    if ('price' in b && b.price !== '' && b.price !== null) out.price = num(b.price, 'Prezzo', { max: 1e8 });
    else if (out.configs) out.price = (out.configs as Config[]).find(c => c.price !== undefined)?.price ?? 0;
    return out;
  }
  router.get('/api/products', async c => { requireUser(c); return json(await store.all<Product>('products', {}, 'createdAt asc')); });
  router.post('/api/products', async c => {
    requireUser(c, 'admin', 'manager');
    const data = productInput(await c.json(), false);
    if (!(data.materials as string[]).length) data.materials = ['Da verificare'];
    if (!(data.colors as string[]).length) data.colors = ['Da verificare'];
    const p = await store.insert<Product>('products', { id: uid(), ...data, price: data.price ?? 0, createdAt: now(), updatedAt: now() });
    return json(p, 201);
  });
  router.patch('/api/products/:id', async c => {
    requireUser(c, 'admin', 'manager');
    const data = productInput(await c.json(), true);
    const p = await store.update<Product>('products', c.params.id, { ...data, updatedAt: now() });
    if (!p) throw new HttpError(404, 'Prodotto non trovato');
    return json(p);
  });
  router.delete('/api/products/:id', async c => {
    requireUser(c, 'admin', 'manager');
    await store.tx(async s => {
      await s.remove('reservations', { productId: c.params.id });
      await s.remove('documentProducts', { productId: c.params.id });
      if (!(await s.remove('products', { id: c.params.id }))) throw new HttpError(404, 'Prodotto non trovato');
    });
    return json({ ok: true });
  });

  // ───────────── file (cataloghi PDF, immagini) ─────────────
  const ALLOWED: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  router.post('/api/files', async c => {
    const u = requireUser(c);
    const mime = (c.req.headers.get('content-type') || '').split(';')[0].trim();
    if (!ALLOWED[mime]) throw new HttpError(415, 'Formato non supportato: caricare PDF, JPG, PNG o WebP');
    const max = config.maxUploadMb * 1024 * 1024;
    const declared = Number(c.req.headers.get('content-length') || 0);
    if (declared > max) throw new HttpError(413, `File troppo grande (massimo ${config.maxUploadMb} MB)`);
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (!data.byteLength) throw new HttpError(400, 'File vuoto');
    if (data.byteLength > max) throw new HttpError(413, `File troppo grande (massimo ${config.maxUploadMb} MB)`);
    if (mime === 'application/pdf' && String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') throw new HttpError(400, 'Il file non è un PDF valido');
    let name = 'file' + ALLOWED[mime];
    try { name = decodeURIComponent(c.req.headers.get('x-file-name') || name); } catch { /* nome di default */ }
    name = name.replace(/[\\/\r\n"]/g, '_').slice(0, 180);
    const f = await saveFile(data, name, mime, u.id);
    return json({ id: f.id, fileName: f.fileName, mime: f.mime, size: f.size, createdBy: f.createdBy, createdAt: f.createdAt }, 201);
  });
  router.get('/api/files/:id', async c => {
    requireUser(c);
    const r = await readFile(c.params.id);
    if (!r) throw new HttpError(404, 'File non trovato');
    const disp = c.url.searchParams.get('download') ? 'attachment' : 'inline';
    return new Response(r.data as Uint8Array<ArrayBuffer>, { headers: {
      'Content-Type': r.file.mime, 'Content-Length': String(r.data.byteLength),
      'Content-Disposition': `${disp}; filename="${r.file.fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(r.file.fileName)}`,
      'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
    } });
  });

  // ───────────── documenti / cataloghi ─────────────
  router.post('/api/documents', async c => {
    const u = requireUser(c);
    const b = await c.json<Record<string, unknown>>();
    const fileId = b.fileId ? str(b.fileId, 'File', { max: 40 }) : null;
    const externalUrl = b.externalUrl ? str(b.externalUrl, 'URL', { max: 2000 }) : null;
    if (!fileId && !externalUrl) throw new HttpError(400, 'Caricare un PDF o inserire un link');
    if (externalUrl && !/^https?:\/\//.test(externalUrl)) throw new HttpError(400, 'Inserisci un link valido.');
    if (fileId) { const f = await store.get<FileRecord>('files', fileId); if (!f || f.mime !== 'application/pdf') throw new HttpError(400, 'Seleziona un file PDF valido.'); }
    const productIds = strList(b.productIds, 'Prodotti', 500);
    for (const pid of new Set(productIds)) if (!(await store.get('products', pid))) throw new HttpError(400, 'Prodotto collegato inesistente');
    const id = uid();
    await store.tx(async s => {
      await s.insert('documents', { id, name: str(b.name, 'Nome documento', { required: true, max: 160 }), type: oneOf(b.type, DOC_TYPES, 'Tipologia', 'Catalogo prodotto'), language: oneOf(b.language, DOC_LANGS, 'Lingua', 'Italiano'), fileId, externalUrl, createdBy: u.id, createdAt: now() });
      for (const pid of new Set(productIds)) { if (!(await s.get('products', pid))) throw new HttpError(400, 'Prodotto collegato inesistente'); await s.insert('documentProducts', { id: uid(), documentId: id, productId: pid }); }
    });
    return json((await documentsAll()).find(d => d.id === id), 201);
  });
  router.patch('/api/documents/:id', async c => {
    const u = requireUser(c);
    const d = await store.get<DocumentRecord>('documents', c.params.id);
    if (!d) throw new HttpError(404, 'Documento non trovato');
    const b = await c.json<Record<string, unknown>>();
    await store.tx(async s => {
      const patch: Record<string, unknown> = {};
      if ('name' in b || 'type' in b || 'language' in b) {
        if (d.createdBy !== u.id && !canManage(u)) throw new HttpError(403, 'Solo l’autore o un responsabile può modificare il documento');
        if ('name' in b) patch.name = str(b.name, 'Nome documento', { required: true, max: 160 });
        if ('type' in b) patch.type = oneOf(b.type, DOC_TYPES, 'Tipologia');
        if ('language' in b) patch.language = oneOf(b.language, DOC_LANGS, 'Lingua');
        await s.update('documents', d.id, patch);
      }
      if ('linkProductId' in b) {
        const pid = str(b.linkProductId, 'Prodotto', { required: true, max: 60 });
        if (!(await s.get('products', pid))) throw new HttpError(400, 'Prodotto inesistente');
        if (!(await s.find('documentProducts', { documentId: d.id, productId: pid }))) await s.insert('documentProducts', { id: uid(), documentId: d.id, productId: pid });
      }
      if ('unlinkProductId' in b) await s.remove('documentProducts', { documentId: d.id, productId: str(b.unlinkProductId, 'Prodotto', { required: true, max: 60 }) });
    });
    return json((await documentsAll()).find(x => x.id === d.id));
  });
  router.delete('/api/documents/:id', async c => {
    const u = requireUser(c);
    const d = await store.get<DocumentRecord>('documents', c.params.id);
    if (!d) throw new HttpError(404, 'Documento non trovato');
    if (d.createdBy !== u.id && !canManage(u)) throw new HttpError(403, 'Solo l’autore o un responsabile può eliminare il documento');
    await store.tx(async s => { await s.remove('documentProducts', { documentId: d.id }); await s.remove('documents', { id: d.id }); });
    if (d.fileId) {
      const f = await store.get<{ storageKey: string }>('files', d.fileId);
      const stillUsed = await store.count('documents', { fileId: d.fileId });
      if (f && !stillUsed) { await storage.delete(f.storageKey); await store.remove('files', { id: d.fileId }); }
    }
    return json({ ok: true });
  });

  // ───────────── clienti ─────────────
  const clientInput = (b: Record<string, unknown>, partial: boolean) => {
    const o: Record<string, unknown> = {};
    if (!partial || 'name' in b) o.name = str(b.name, 'Nome e cognome', { required: true, max: 120 });
    if (!partial || 'email' in b) o.email = email(b.email);
    if (!partial || 'phone' in b) o.phone = str(b.phone, 'Telefono', { max: 40 });
    if (!partial || 'notes' in b) o.notes = str(b.notes, 'Note', { max: 4000 });
    return o;
  };
  router.post('/api/clients', async c => {
    const u = requireUser(c);
    return json(await store.insert<Client>('clients', { id: uid(), ...clientInput(await c.json(), false), ownerId: u.id, createdAt: now(), updatedAt: now() }), 201);
  });
  router.patch('/api/clients/:id', async c => {
    requireUser(c);
    const cl = await store.update<Client>('clients', c.params.id, { ...clientInput(await c.json(), true), updatedAt: now() });
    if (!cl) throw new HttpError(404, 'Cliente non trovato');
    return json(cl);
  });
  router.delete('/api/clients/:id', async c => {
    const u = requireUser(c);
    const cl = await store.get<Client>('clients', c.params.id);
    if (!cl) throw new HttpError(404, 'Cliente non trovato');
    if (cl.ownerId !== u.id && !canManage(u)) throw new HttpError(403, 'Solo chi ha registrato il cliente o un responsabile può eliminarlo');
    if (await store.count('quotes', { clientId: cl.id, status: 'sent' })) throw new HttpError(409, 'Il cliente ha preventivi inviati: non può essere eliminato');
    await store.tx(async s => {
      for (const q of await s.all<Quote>('quotes', { clientId: cl.id, status: 'draft' })) await s.update('quotes', q.id, { clientId: null });
      for (const r of await s.all<Reservation>('reservations', { clientId: cl.id })) await s.update('reservations', r.id, { clientId: null });
      await s.remove('clients', { id: cl.id });
    });
    return json({ ok: true });
  });

  // ───────────── preventivi ─────────────
  router.get('/api/quotes/current', async c => json(await currentDraft(requireUser(c))));
  router.get('/api/quotes', async c => {
    const u = requireUser(c);
    const all = await store.all<Quote>('quotes', { status: 'sent' }, 'sentAt desc');
    const visible = canManage(u) ? all : all.filter(q => q.createdBy === u.id);
    return json(await Promise.all(visible.slice(0, 200).map(q => hydrateQuote(q))));
  });
  router.get('/api/quotes/:id', async c => json(await hydrateQuote(await ownQuote(c, c.params.id, false))));
  router.patch('/api/quotes/:id', async c => {
    const q = await ownQuote(c, c.params.id);
    const b = await c.json<Record<string, unknown>>();
    const patch: Record<string, unknown> = {};
    if ('clientId' in b) { const id = b.clientId ? str(b.clientId, 'Cliente', { max: 40 }) : null; if (id && !(await store.get('clients', id))) throw new HttpError(400, 'Cliente inesistente'); patch.clientId = id; }
    if ('currency' in b) patch.currency = oneOf(b.currency, ['CHF', 'EUR'] as const, 'Valuta');
    if ('rate' in b) patch.rate = num(b.rate, 'Cambio', { min: 0.01, max: 100 });
    if ('showPrices' in b) patch.showPrices = !!b.showPrices;
    if ('subject' in b) patch.subject = str(b.subject, 'Oggetto', { max: 200 });
    if ('body' in b) patch.body = str(b.body, 'Messaggio', { max: 10000 });
    return json(await hydrateQuote((await store.update<Quote>('quotes', q.id, patch))!));
  });
  router.post('/api/quotes/:id/items', async c => {
    const q = await ownQuote(c, c.params.id);
    const b = await c.json<Record<string, unknown>>();
    const p = await store.get<Product>('products', str(b.productId, 'Prodotto', { required: true, max: 60 }));
    if (!p) throw new HttpError(404, 'Prodotto non trovato');
    const idx = num(b.configIndex ?? 0, 'Composizione', { max: 100 })!;
    const cfg = p.configs[idx];
    if (!cfg) throw new HttpError(400, 'Composizione non valida');
    if (cfg.price === undefined || cfg.price === null) throw new HttpError(400, 'Prezzo della composizione da verificare: non può essere aggiunta al preventivo');
    const material = str(b.material, 'Materiale', { max: 80 }) || p.materials[0] || '';
    const color = str(b.color, 'Colore', { max: 80 }) || p.colors[0] || '';
    if (p.materials.length && !p.materials.includes(material)) throw new HttpError(400, 'Materiale non previsto per il prodotto');
    if (p.colors.length && !p.colors.includes(color)) throw new HttpError(400, 'Colore non previsto per il prodotto');
    const position = (await store.count('quoteItems', { quoteId: q.id })) + 1;
    await store.insert('quoteItems', { id: uid(), quoteId: q.id, productId: p.id, brand: p.brand, productName: p.name, config: cfg.name, dims: cfg.dims, material, color, price: cfg.price, currency: p.currency, position });
    return json(await hydrateQuote(q), 201);
  });
  router.delete('/api/quotes/:id/items/:itemId', async c => {
    const q = await ownQuote(c, c.params.id);
    await store.remove('quoteItems', { id: c.params.itemId, quoteId: q.id });
    return json(await hydrateQuote(q));
  });
  router.post('/api/quotes/:id/pdf', async c => {
    const u = requireUser(c);
    const q = await hydrateQuote(await ownQuote(c, c.params.id, false));
    if (!q.items.length) throw new HttpError(400, 'Nessun prodotto selezionato.');
    const pdf = await quotePdf(q, u);
    const f = await saveFile(pdf, `Proposta ${q.number ?? 'bozza'} - Peverelli Design.pdf`.replace(/\s+/g, ' '), 'application/pdf', u.id);
    if (q.status === 'draft') await store.update('quotes', q.id, { pdfFileId: f.id });
    return json({ fileId: f.id, fileName: f.fileName, size: f.size });
  });
  router.post('/api/quotes/:id/send', async c => {
    const u = requireUser(c);
    const q0 = await ownQuote(c, c.params.id);
    const b = await c.json<Record<string, unknown>>();
    const to = email(b.to, 'Email destinatario', true);
    const subject = str(b.subject, 'Oggetto', { required: true, max: 200 });
    const body = str(b.body, 'Messaggio', { max: 10000 });
    const showPrices = b.showPrices !== false;
    const attachPdf = b.attachPdf !== false;
    const documentIds = strList(b.documentIds, 'Documenti', 20);
    const items = await store.all<QuoteItem>('quoteItems', { quoteId: q0.id });
    if (!items.length) throw new HttpError(400, 'Nessun prodotto selezionato.');
    // assegna numero progressivo annuale
    const year = clock().getFullYear();
    let sent: Quote | null = null;
    for (let attempt = 0; attempt < 5 && !sent; attempt++) {
      try {
        sent = await store.tx(async s => {
          const nums = (await s.all<Quote>('quotes', { status: 'sent' })).map(x => x.number || '').filter(n => n.startsWith(`PD-${year}-`)).map(n => Number(n.split('-')[2]) || 0);
          const number = `PD-${year}-${String(Math.max(0, ...nums) + 1 + attempt).padStart(4, '0')}`;
          const total = quoteTotal(items, q0.currency, q0.rate);
          // sincronizza email cliente se mancante
          if (q0.clientId) { const cl = await s.get<Client>('clients', q0.clientId); if (cl && !cl.email) await s.update('clients', cl.id, { email: to, updatedAt: now() }); }
          return (await s.update<Quote>('quotes', q0.id, { number, status: 'sent', sentAt: now(), total, subject, body, showPrices }))!;
        });
      } catch (e) { if (!(e instanceof UniqueViolation)) throw e; }
    }
    if (!sent) throw new HttpError(409, 'Impossibile assegnare il numero di preventivo, riprovare');
    const q = await hydrateQuote(sent);
    const attachments: (MailAttachment & { fileId: string })[] = [];
    const lim = mailer.limits ?? { maxAttachments: 10, maxAttachmentBytes: 20 * 1024 * 1024, maxTotalBytes: 20 * 1024 * 1024 };
    let totalBytes = 0;
    const skipped: string[] = [];
    const linked: { name: string; url: string }[] = [];
    const attachOrLink = async (fileId: string, name: string, fileName: string, data: Uint8Array) => {
      if (attachments.length < lim.maxAttachments && data.byteLength <= lim.maxAttachmentBytes && totalBytes + data.byteLength <= lim.maxTotalBytes) {
        totalBytes += data.byteLength;
        attachments.push({ fileId, filename: fileName, content: data, contentType: 'application/pdf' });
      } else {
        skipped.push(name);
        linked.push({ name, url: await signedFileUrl(fileId, c.url.origin) });
      }
    };
    if (attachPdf) {
      const pdf = await quotePdf(q, u);
      const f = await saveFile(pdf, `Proposta ${q.number} - Peverelli Design.pdf`, 'application/pdf', u.id);
      await store.update('quotes', q.id, { pdfFileId: f.id });
      q.pdfFileId = f.id;
      await attachOrLink(f.id, `Proposta ${q.number}`, f.fileName, pdf);
    }
    const docs = await documentsAll();
    for (const id of documentIds) {
      const d = docs.find(x => x.id === id);
      if (!d?.fileId) continue;
      const r = await readFile(d.fileId);
      if (r) await attachOrLink(d.fileId, d.name, r.file.fileName, r.data);
    }
    const externals = docs.filter(d => documentIds.includes(d.id) && d.externalUrl).map(d => ({ name: d.name, url: d.externalUrl! }));
    const links = [...linked, ...externals];
    const text = body + (items.length ? '\n\nPRODOTTI SELEZIONATI\n\n' + quoteText(q, showPrices) + (showPrices ? '\n\nTotale indicativo: ' + formatMoney(q.total, q.currency) : '') : '')
      + (links.length ? '\n\nDOCUMENTI\n' + links.map(d => `${d.name}: ${d.url}`).join('\n') + (linked.length ? `\n(link validi ${LINK_DAYS} giorni)` : '') : '');
    const rec = await sendAndLog(u, to, subject, text, attachments, { quoteId: q.id });
    const next = await currentDraft(u);
    return json({ quote: { ...q, emailStatus: rec.status }, email: rec, nextDraft: next, skipped });
  });
  router.post('/api/quotes/:id/duplicate', async c => {
    const u = requireUser(c);
    const src = await hydrateQuote(await ownQuote(c, c.params.id, false));
    const draft = await currentDraft(u);
    let pos = draft.items.length;
    for (const it of src.items) await store.insert('quoteItems', { ...it, id: uid(), quoteId: draft.id, position: ++pos });
    await store.update('quotes', draft.id, { clientId: src.clientId, currency: src.currency, rate: src.rate });
    return json(await currentDraft(u));
  });

  // ───────────── agenda ─────────────
  function apptInput(b: Record<string, unknown>) {
    return {
      client: str(b.client, 'Nome cliente', { required: true, max: 120 }), email: email(b.email),
      clientId: b.clientId ? str(b.clientId, 'Cliente', { max: 40 }) : null,
      site: oneOf(b.site, SHOWROOMS, 'Showroom'), type: oneOf(b.type, APPT_TYPES, 'Tipologia'),
      date: dateStr(b.date), time: oneOf(b.time, APPT_TIMES, 'Orario'), duration: oneOf(String(b.duration ?? '60'), APPT_DURATIONS, 'Durata'),
      notes: str(b.notes, 'Note', { max: 2000 }),
      consultantId: b.consultantId ? str(b.consultantId, 'Consulente', { max: 40 }) : null,
    };
  }
  async function insertAppointment(data: ReturnType<typeof apptInput>, source: 'interno' | 'online', createdBy: string | null) {
    if (data.date < new Date(clock().getTime() - 864e5).toISOString().slice(0, 10)) throw new HttpError(400, 'La data è nel passato');
    try {
      return await store.insert<Appointment>('appointments', { id: uid(), ...data, source, createdBy, createdAt: now() });
    } catch (e) {
      if (e instanceof UniqueViolation) throw new HttpError(409, 'Esiste già un appuntamento in questa sede e fascia oraria.');
      throw e;
    }
  }
  router.post('/api/appointments', async c => {
    const u = requireUser(c);
    const data = apptInput(await c.json());
    if (!data.consultantId) data.consultantId = u.id;
    return json(await insertAppointment(data, 'interno', u.id), 201);
  });
  router.patch('/api/appointments/:id', async c => {
    requireUser(c);
    const a = await store.get<Appointment>('appointments', c.params.id);
    if (!a) throw new HttpError(404, 'Appuntamento non trovato');
    const data = apptInput({ ...a, ...(await c.json()) });
    try { return json(await store.update('appointments', a.id, data)); }
    catch (e) { if (e instanceof UniqueViolation) throw new HttpError(409, 'Esiste già un appuntamento in questa sede e fascia oraria.'); throw e; }
  });
  router.delete('/api/appointments/:id', async c => {
    const u = requireUser(c);
    const a = await store.get<Appointment>('appointments', c.params.id);
    if (!a) throw new HttpError(404, 'Appuntamento non trovato');
    if (a.createdBy && a.createdBy !== u.id && a.consultantId !== u.id && !canManage(u)) throw new HttpError(403, 'Appuntamento di un altro consulente');
    await store.remove('appointments', { id: a.id });
    return json({ ok: true });
  });
  const confirmationText = (a: Appointment) => `Gentile ${a.client},\n\nLe confermiamo l'appuntamento presso il nostro showroom di ${a.site} il ${a.date.split('-').reverse().join('/')} alle ore ${a.time}.\n\nCordiali saluti,\nPeverelli Design`;
  async function sendConfirmation(a: Appointment, u: DbUser | null) {
    if (!a.email) throw new HttpError(400, 'Email cliente non inserita');
    const ics = new TextEncoder().encode(appointmentIcs(a, u?.email || 'showroom@peverelli.design', `Peverelli Design — ${a.site}`));
    const f = await saveFile(ics, 'appuntamento-peverelli-design.ics', 'text/calendar', u?.id ?? null);
    return sendAndLog(u, a.email, 'Conferma appuntamento — Peverelli Design', confirmationText(a), [{ fileId: f.id, filename: f.fileName, content: ics, contentType: 'text/calendar; method=REQUEST' }], { appointmentId: a.id });
  }
  router.post('/api/appointments/:id/confirm', async c => {
    const u = requireUser(c);
    const a = await store.get<Appointment>('appointments', c.params.id);
    if (!a) throw new HttpError(404, 'Appuntamento non trovato');
    return json(await sendConfirmation(a, u));
  });

  // ── prenotazione pubblica /book/:sede ──
  router.get('/api/public/slots', async c => {
    if (!config.publicBooking) throw new HttpError(404, 'Prenotazione online non attiva');
    const site = oneOf(c.url.searchParams.get('site'), SHOWROOMS, 'Showroom');
    const date = dateStr(c.url.searchParams.get('date'));
    const taken = (await store.all<Appointment>('appointments', { site, date })).map(a => a.time);
    return json({ site, date, times: APPT_TIMES.filter(t => !taken.includes(t)), types: APPT_TYPES });
  });
  router.post('/api/public/book', async c => {
    if (!config.publicBooking) throw new HttpError(404, 'Prenotazione online non attiva');
    const b = await c.json<Record<string, unknown>>();
    checkRateLimit('book:' + (c.req.headers.get('x-forwarded-for') || 'local'), 10, 60 * 60_000);
    if (b.website) throw new HttpError(400, 'Richiesta non valida'); // honeypot anti-spam
    const data = apptInput({ ...b, clientId: null, consultantId: null });
    if (!data.email) throw new HttpError(400, 'Email: campo obbligatorio');
    const a = await insertAppointment(data, 'online', null);
    let mail: EmailRecord | null = null;
    try { mail = await sendConfirmation(a, null); } catch (e) { console.warn('[booking] conferma non inviata', e); }
    return json({ ok: true, appointment: { site: a.site, date: a.date, time: a.time, type: a.type }, emailStatus: mail?.status ?? null }, 201);
  });

  // ───────────── attività ─────────────
  router.post('/api/tasks', async c => {
    const u = requireUser(c);
    const b = await c.json<Record<string, unknown>>();
    return json(await store.insert<Task>('tasks', { id: uid(), name: str(b.name, 'Attività', { required: true, max: 300 }), done: false, assigneeId: b.assigneeId ? str(b.assigneeId, 'Assegnatario', { max: 40 }) : null, dueDate: b.dueDate ? dateStr(b.dueDate, 'Scadenza') : null, createdBy: u.id, createdAt: now() }), 201);
  });
  router.patch('/api/tasks/:id', async c => {
    requireUser(c);
    const b = await c.json<Record<string, unknown>>();
    const patch: Record<string, unknown> = {};
    if ('done' in b) patch.done = !!b.done;
    if ('name' in b) patch.name = str(b.name, 'Attività', { required: true, max: 300 });
    if ('assigneeId' in b) patch.assigneeId = b.assigneeId ? str(b.assigneeId, 'Assegnatario', { max: 40 }) : null;
    if ('dueDate' in b) patch.dueDate = b.dueDate ? dateStr(b.dueDate, 'Scadenza') : null;
    const t = await store.update<Task>('tasks', c.params.id, patch);
    if (!t) throw new HttpError(404, 'Attività non trovata');
    return json(t);
  });
  router.delete('/api/tasks/:id', async c => { requireUser(c); await store.remove('tasks', { id: c.params.id }); return json({ ok: true }); });

  // ───────────── riserve ─────────────
  router.post('/api/reservations', async c => {
    const u = requireUser(c);
    const b = await c.json<Record<string, unknown>>();
    const p = await store.get<Product>('products', str(b.productId, 'Prodotto', { required: true, max: 60 }));
    if (!p) throw new HttpError(404, 'Prodotto non trovato');
    if (p.status === 'Riservato' || p.status === 'Venduto') throw new HttpError(409, `Prodotto già ${p.status.toLowerCase()}`);
    const cl = b.clientId ? await store.get<Client>('clients', str(b.clientId, 'Cliente', { max: 40 })) : null;
    try {
      return json(await store.insert<Reservation>('reservations', { id: uid(), productId: p.id, clientId: cl?.id ?? null, client: cl?.name ?? str(b.client, 'Cliente', { max: 120, def: 'Cliente' }), userId: u.id, createdAt: now() }), 201);
    } catch (e) { if (e instanceof UniqueViolation) throw new HttpError(409, 'Prodotto già riservato'); throw e; }
  });
  router.delete('/api/reservations/:productId', async c => {
    const u = requireUser(c);
    const r = await store.find<Reservation>('reservations', { productId: c.params.productId });
    if (!r) throw new HttpError(404, 'Riserva non trovata');
    if (r.userId !== u.id && !canManage(u)) throw new HttpError(403, 'Solo chi ha creato la riserva o un responsabile può rimuoverla');
    await store.remove('reservations', { id: r.id });
    return json({ ok: true });
  });

  // ───────────── email inviate ─────────────
  router.get('/api/emails', async c => {
    const u = requireUser(c);
    const all = await store.all<EmailRecord>('emails', {}, 'createdAt desc');
    return json((canManage(u) ? all : all.filter(e => e.sentBy === u.id)).slice(0, 200));
  });

  // ───────────── assistente ─────────────
  router.post('/api/assistant', async c => {
    requireUser(c);
    const b = await c.json<{ q?: string }>();
    const q = str(b.q, 'Domanda', { required: true, max: 500 });
    const [products, res, docs] = await Promise.all([store.all<Product>('products'), store.all<Reservation>('reservations'), documentsAll()]);
    return json(await ask(q, products.map(p => ({ ...p, liveStatus: liveStatus(p, res) })), docs, deps.llm));
  });

  // ───────────── utenti (amministrazione) ─────────────
  router.get('/api/users', async c => { requireUser(c, 'admin'); return json((await store.all<DbUser>('users', {}, 'name asc')).map(publicUser)); });
  router.post('/api/users', async c => {
    requireUser(c, 'admin');
    const b = await c.json<Record<string, unknown>>();
    const password = str(b.password, 'Password temporanea', { required: true, max: 200 });
    if (password.length < 10) throw new HttpError(400, 'La password deve avere almeno 10 caratteri');
    try {
      const u = await store.insert<DbUser>('users', { id: uid(), email: email(b.email, 'Email', true), name: str(b.name, 'Nome', { required: true, max: 120 }), role: oneOf(b.role, ROLES, 'Ruolo'), site: oneOf(b.site, LOCATIONS, 'Sede', 'Como'), active: true, passwordHash: await hashPassword(password), createdAt: now() });
      return json(publicUser(u), 201);
    } catch (e) { if (e instanceof UniqueViolation) throw new HttpError(409, 'Esiste già un utente con questa email'); throw e; }
  });
  router.patch('/api/users/:id', async c => {
    const me = requireUser(c, 'admin');
    const b = await c.json<Record<string, unknown>>();
    const patch: Record<string, unknown> = {};
    if ('name' in b) patch.name = str(b.name, 'Nome', { required: true, max: 120 });
    if ('role' in b) patch.role = oneOf(b.role, ROLES, 'Ruolo') as Role;
    if ('site' in b) patch.site = oneOf(b.site, LOCATIONS, 'Sede');
    if ('active' in b) patch.active = !!b.active;
    if (c.params.id === me.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) throw new HttpError(400, 'Non puoi disattivare o declassare il tuo account');
    if ('password' in b) { const p = str(b.password, 'Password', { required: true, max: 200 }); if (p.length < 10) throw new HttpError(400, 'La password deve avere almeno 10 caratteri'); patch.passwordHash = await hashPassword(p); }
    const u = await store.update<DbUser>('users', c.params.id, patch);
    if (!u) throw new HttpError(404, 'Utente non trovato');
    if (patch.active === false || patch.passwordHash) await store.remove('sessions', { userId: u.id });
    return json(publicUser(u));
  });

  return {
    fetch: (req: Request, opts?: Parameters<typeof router.handle>[1]) => router.handle(req, opts),
    /** Pulizia sessioni scadute (chiamata periodicamente dal server). */
    async purgeSessions() {
      const all = await store.all<{ id: string; expiresAt: string }>('sessions');
      for (const s of all) if (new Date(s.expiresAt).getTime() < Date.now()) await store.remove('sessions', { id: s.id });
    },
  };
}

export type App = ReturnType<typeof createApp>;
export { SESSION_COOKIE, sha256 };
export type { Currency };
