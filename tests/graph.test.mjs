// Email tramite Microsoft Graph (Outlook / Microsoft 365) con server Microsoft simulato:
// token OAuth client credentials, sendMail diretto, bozza + upload session per allegati grandi, errori leggibili.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://myshowroom:myshowroom@127.0.0.1:5432/myshowroom_test';
const PORT = 3125, MS = 2601, BASE = `http://127.0.0.1:${PORT}`, MSB = `http://127.0.0.1:${MS}`;
const MAILBOXES = ['admin@test.local', 'showroom@peverelli.test'];
const log = []; const sent = []; const drafts = {}; let tokens = 0, deny = false;
let srv, ms, cookie = '';
const req = async (method, url, body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await fetch(BASE + url, { method, headers: { 'X-Requested-With': 'myshowroom', ...(cookie ? { cookie } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  for (const c of r.headers.getSetCookie()) cookie = c.split(';')[0];
  return { status: r.status, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};

function fakeMicrosoft(q, s) {
  const chunks = []; q.on('data', d => chunks.push(d)); q.on('end', () => {
    const buf = Buffer.concat(chunks); const u = new URL(q.url, MSB); log.push(`${q.method} ${u.pathname}`);
    const reply = (code, obj) => { s.writeHead(code, { 'content-type': 'application/json' }); s.end(obj ? JSON.stringify(obj) : undefined); };
    if (u.pathname === '/tenant-123/oauth2/v2.0/token') {
      const f = new URLSearchParams(buf.toString());
      if (f.get('client_secret') !== 'segreto' || f.get('grant_type') !== 'client_credentials' || f.get('scope') !== 'https://graph.microsoft.com/.default') return reply(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' });
      tokens++; return reply(200, { access_token: 'tok', expires_in: 3599, token_type: 'Bearer' });
    }
    if (u.pathname.startsWith('/upload/')) {
      const d = drafts[u.pathname.split('/')[2]]; const a = d.uploads.at(-1);
      const [, start, end, total] = q.headers['content-range'].match(/bytes (\d+)-(\d+)\/(\d+)/).map(Number);
      assert.equal(q.headers.authorization, undefined); assert.equal(end - start + 1, buf.length); assert.ok(buf.length <= 4 * 1024 * 1024);
      a.data = Buffer.concat([a.data, buf]); a.total = total; return reply(end + 1 === total ? 201 : 200, {});
    }
    const mb = decodeURIComponent((u.pathname.match(/^\/v1\.0\/users\/([^/]+)/) || [])[1] || '');
    if (q.headers.authorization !== 'Bearer tok') return reply(401, { error: { code: 'InvalidAuthenticationToken', message: 'Access token is empty.' } });
    if (deny) return reply(403, { error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } });
    if (!MAILBOXES.includes(mb)) return reply(404, { error: { code: 'ErrorInvalidUser', message: 'The requested user is invalid.' } });
    const p = u.pathname.slice(`/v1.0/users/${encodeURIComponent(mb)}`.length);
    const body = buf.length && q.headers['content-type']?.includes('json') ? JSON.parse(buf) : null;
    if (q.method === 'POST' && p === '/sendMail') { sent.push({ mode: 'direct', mailbox: mb, message: body.message, saveToSentItems: body.saveToSentItems }); return reply(202); }
    if (q.method === 'POST' && p === '/messages') { const id = 'draft' + Object.keys(drafts).length; drafts[id] = { message: body, attachments: [], uploads: [] }; return reply(201, { id }); }
    let m;
    if ((m = p.match(/^\/messages\/(\w+)\/attachments$/))) { drafts[m[1]].attachments.push(body); return reply(201, { id: 'att' }); }
    if ((m = p.match(/^\/messages\/(\w+)\/attachments\/createUploadSession$/))) { drafts[m[1]].uploads.push({ meta: body.AttachmentItem, data: Buffer.alloc(0) }); return reply(201, { uploadUrl: `${MSB}/upload/${m[1]}` }); }
    if ((m = p.match(/^\/messages\/(\w+)\/send$/))) { sent.push({ mode: 'draft', mailbox: mb, ...drafts[m[1]] }); return reply(202); }
    if (q.method === 'DELETE') return reply(204);
    reply(400, { error: { code: 'BadRequest', message: p } });
  });
}

before(async () => {
  const sql = postgres(DB, { onnotice: () => {} }); await sql.unsafe('drop schema public cascade; create schema public;'); await sql.end();
  ms = http.createServer(fakeMicrosoft).listen(MS);
  await new Promise((resolve, reject) => {
    srv = spawn(process.execPath, [path.join(root, 'build/server.mjs')], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'ms-graph-')), SMTP_HOST: '',
      MAIL_PROVIDER: 'microsoft', MS_TENANT_ID: 'tenant-123', MS_CLIENT_ID: 'client-abc', MS_CLIENT_SECRET: 'segreto', MAIL_FROM: 'Peverelli Design <showroom@peverelli.test>', MS_LOGIN_URL: MSB, MS_GRAPH_URL: MSB,
      ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-password-1', SEED_DEMO: 'true', SKIP_CATALOG_IMPORT: 'true', APP_SECRET: 'segreto-di-test' }, stdio: ['ignore', 'pipe', 'inherit'] });
    srv.stdout.on('data', d => { if (String(d).includes('email: microsoft')) resolve(); });
    srv.on('exit', c => reject(new Error('server exited ' + c)));
  });
  assert.equal((await req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'admin-password-1' })).status, 200);
});
after(() => { srv.kill(); ms.close(); });

test('conferma appuntamento: parte dalla casella dell’utente collegato, sendMail diretto con .ics', async () => {
  const date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const a = (await req('POST', '/api/appointments', { client: 'Anna', email: 'anna@example.com', site: 'Como Città', type: 'Visita showroom', date, time: '10:00', duration: '60' })).body;
  const r = await req('POST', `/api/appointments/${a.id}/confirm`);
  assert.equal(r.body.status, 'sent', JSON.stringify(r.body));
  const msg = sent.at(-1);
  assert.equal(msg.mode, 'direct'); assert.equal(msg.saveToSentItems, true);
  assert.equal(msg.mailbox, 'admin@test.local');
  assert.deepEqual(msg.message.toRecipients, [{ emailAddress: { address: 'anna@example.com' } }]);
  assert.equal(msg.message.from.emailAddress.address, 'admin@test.local');
  assert.equal(msg.message.replyTo, undefined);
  assert.equal(msg.message.attachments[0]['@odata.type'], '#microsoft.graph.fileAttachment');
  assert.match(Buffer.from(msg.message.attachments[0].contentBytes, 'base64').toString(), /BEGIN:VCALENDAR/);
});

test('preventivo con catalogo da 9 MB: bozza, upload a blocchi, invio; token riutilizzato', async () => {
  const small = readFileSync(path.join(root, 'tests/fixtures/catalogo.pdf'));
  const big = new Uint8Array(Buffer.concat([small, Buffer.alloc(9 * 1024 * 1024, 0x20)]));
  const f = (await req('POST', '/api/files', big, { 'Content-Type': 'application/pdf', 'X-File-Name': 'Catalogo grande.pdf' })).body;
  const d = (await req('POST', '/api/documents', { name: 'Catalogo grande', type: 'Catalogo generale', language: 'Italiano', fileId: f.id, productIds: ['em'] })).body;
  const q = (await req('GET', '/api/quotes/current')).body;
  await req('POST', `/api/quotes/${q.id}/items`, { productId: 'em', configIndex: 0 });
  const s = await req('POST', `/api/quotes/${q.id}/send`, { to: 'cliente@example.com', subject: 'Proposta', body: 'Gentile cliente,', attachPdf: true, documentIds: [d.id] });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.email.status, 'sent', s.body.email.error);
  assert.deepEqual(s.body.skipped, []);
  const msg = sent.at(-1);
  assert.equal(msg.mode, 'draft'); assert.equal(msg.mailbox, 'admin@test.local');
  assert.equal(msg.message.subject, 'Proposta');
  assert.equal(msg.attachments.length, 1); assert.match(msg.attachments[0].name, /^Proposta PD-\d{4}-0001/);
  assert.equal(msg.uploads.length, 1);
  assert.equal(msg.uploads[0].meta.name, 'Catalogo grande.pdf');
  assert.ok(Buffer.from(msg.uploads[0].data).equals(Buffer.from(big)), 'allegato ricomposto identico');
  assert.equal(tokens, 1, 'token OAuth richiesto una sola volta');
});

test('permesso mancante: errore leggibile, bozza eliminata', async () => {
  deny = true;
  const date = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  const a = (await req('POST', '/api/appointments', { client: 'Bruno', email: 'bruno@example.com', site: 'Como Città', type: 'Visita showroom', date, time: '11:00', duration: '60' })).body;
  const r = await req('POST', `/api/appointments/${a.id}/confirm`);
  deny = false;
  assert.equal(r.body.status, 'failed');
  assert.match(r.body.error, /ErrorAccessDenied.*Mail\.Send/);
});

test('utente senza casella Microsoft 365: invio dalla casella condivisa MAIL_FROM con risposta all’utente', async () => {
  const g = await req('POST', '/api/users', { name: 'Giulia Rossi', email: 'giulia@altrodominio.test', role: 'consultant', site: 'Milano', password: 'password-giulia-1' });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  const saved = cookie; cookie = '';
  assert.equal((await req('POST', '/api/auth/login', { email: 'giulia@altrodominio.test', password: 'password-giulia-1' })).status, 200);
  const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const a = (await req('POST', '/api/appointments', { client: 'Carla', email: 'carla@example.com', site: 'Milano', type: 'Visita showroom', date, time: '12:00', duration: '60' })).body;
  const r = await req('POST', `/api/appointments/${a.id}/confirm`);
  cookie = saved;
  assert.equal(r.body.status, 'sent', r.body.error);
  const msg = sent.at(-1);
  assert.equal(msg.mailbox, 'showroom@peverelli.test');
  assert.deepEqual(msg.message.from, { emailAddress: { address: 'showroom@peverelli.test', name: 'Peverelli Design' } });
  assert.deepEqual(msg.message.replyTo, [{ emailAddress: { address: 'giulia@altrodominio.test' } }]);
});

test('l’amministratore corregge l’email di un utente; email duplicate rifiutate', async () => {
  const users = (await req('GET', '/api/users')).body;
  const giulia = users.find(u => u.email === 'giulia@altrodominio.test');
  const r = await req('PATCH', `/api/users/${giulia.id}`, { email: 'Giulia@Peverelli.test' });
  assert.equal(r.status, 200); assert.equal(r.body.email, 'giulia@peverelli.test');
  assert.equal((await req('PATCH', `/api/users/${giulia.id}`, { email: 'admin@test.local' })).status, 409);
});
