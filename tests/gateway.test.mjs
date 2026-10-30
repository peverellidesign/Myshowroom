// Email tramite gateway GoDaddy (simulato): limiti allegati e link firmati per i file troppo grandi.
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
const PORT = 3124, GW = 2599, BASE = `http://127.0.0.1:${PORT}`;
const received = [];
let srv, gw, cookie = '';
const req = async (method, url, body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await fetch(BASE + url, { method, headers: { 'X-Requested-With': 'myshowroom', ...(cookie ? { cookie } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  for (const c of r.headers.getSetCookie()) cookie = c.split(';')[0];
  return { status: r.status, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};

before(async () => {
  const sql = postgres(DB, { onnotice: () => {} }); await sql.unsafe('drop schema public cascade; create schema public;'); await sql.end();
  gw = http.createServer((q, s) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { received.push(JSON.parse(b)); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ success: true, messageId: 'gw-' + received.length })); }); }).listen(GW);
  await new Promise((resolve, reject) => {
    srv = spawn(process.execPath, [path.join(root, 'build/server.mjs')], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'ms-gw-')), MAIL_PROVIDER: 'godaddy', MAIL_GATEWAY_URL: `http://127.0.0.1:${GW}/api/email/send`, SMTP_HOST: '', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-password-1', SEED_DEMO: 'true', SKIP_CATALOG_IMPORT: 'true', APP_SECRET: 'segreto-di-test' }, stdio: ['ignore', 'pipe', 'inherit'] });
    srv.stdout.on('data', d => { if (String(d).includes('email: gateway')) resolve(); });
    srv.on('exit', c => reject(new Error('server exited ' + c)));
  });
});
after(() => { srv.kill(); gw.close(); });

test('preventivo via gateway: PDF allegato, catalogo da 3 MB come link firmato', async () => {
  assert.equal((await req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'admin-password-1' })).status, 200);
  const small = readFileSync(path.join(root, 'tests/fixtures/catalogo.pdf'));
  const big = new Uint8Array(Buffer.concat([small, Buffer.alloc(3 * 1024 * 1024, 0x20)]));
  const f = (await req('POST', '/api/files', big, { 'Content-Type': 'application/pdf', 'X-File-Name': 'Catalogo grande.pdf' })).body;
  const d = (await req('POST', '/api/documents', { name: 'Catalogo grande', type: 'Catalogo generale', language: 'Italiano', fileId: f.id, productIds: ['em'] })).body;
  const q = (await req('GET', '/api/quotes/current')).body;
  await req('POST', `/api/quotes/${q.id}/items`, { productId: 'em', configIndex: 0 });
  const s = await req('POST', `/api/quotes/${q.id}/send`, { to: 'cliente@example.com', subject: 'Proposta', body: 'Gentile cliente,', attachPdf: true, documentIds: [d.id] });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.email.status, 'sent');
  assert.deepEqual(s.body.skipped, ['Catalogo grande']);
  const msg = received.at(-1);
  assert.deepEqual(msg.to, ['cliente@example.com']);
  assert.equal(msg.from, undefined, 'il mittente lo sceglie il gateway');
  assert.equal(msg.attachments.length, 1);
  assert.match(msg.attachments[0].filename, /^Proposta PD-\d{4}-0001/);
  assert.ok(Buffer.from(msg.attachments[0].content, 'base64').subarray(0, 5).toString() === '%PDF-');
  const link = msg.text.match(/Catalogo grande: (http\S+)/)[1];
  const dl = await fetch(link.replace(/^https?:\/\/[^/]+/, BASE)); // senza cookie
  assert.equal(dl.status, 200);
  assert.equal((await dl.arrayBuffer()).byteLength, big.byteLength);
  assert.equal((await fetch(link.replace(/^https?:\/\/[^/]+/, BASE).replace(/sig=../, 'sig=00'))).status, 403, 'firma alterata rifiutata');
});

test('conferma appuntamento via gateway con invito .ics', async () => {
  const date = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const a = (await req('POST', '/api/appointments', { client: 'Anna', email: 'anna@example.com', site: 'Como Città', type: 'Visita showroom', date, time: '10:00', duration: '60' })).body;
  const r = await req('POST', `/api/appointments/${a.id}/confirm`);
  assert.equal(r.body.status, 'sent');
  const msg = received.at(-1);
  assert.equal(msg.attachments[0].contentType, 'text/calendar');
  assert.match(Buffer.from(msg.attachments[0].content, 'base64').toString(), /BEGIN:VCALENDAR/);
});
