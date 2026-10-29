// Contatti: campi ampliati, foto del biglietto, informativa modificabile, modulo privacy firmato, cancellazione.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { parseBusinessCard } from '../shared/cardParse.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://myshowroom:myshowroom@127.0.0.1:5432/myshowroom_test';
const PORT = 3126, BASE = `http://127.0.0.1:${PORT}`;
let srv; const jar = { admin: '', giulia: '' };
const req = async (who, method, url, body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await fetch(BASE + url, { method, headers: { 'X-Requested-With': 'myshowroom', ...(jar[who] ? { cookie: jar[who] } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  for (const c of r.headers.getSetCookie()) jar[who] = c.split(';')[0];
  return { status: r.status, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};
// PNG 1x1 valido ingrandito con metadati per superare la soglia minima della firma
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sig = 'data:image/png;base64,' + Buffer.concat([png.subarray(0, 33), Buffer.from([0, 0, 1, 0, 116, 69, 88, 116]), Buffer.alloc(256, 65), Buffer.from([0, 0, 0, 0]), png.subarray(33)]).toString('base64');
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1), 0xff, 0xd9]);

before(async () => {
  const sql = postgres(DB, { onnotice: () => {} }); await sql.unsafe('drop schema public cascade; create schema public;'); await sql.end();
  await new Promise((resolve, reject) => {
    srv = spawn(process.execPath, [path.join(root, 'build/server.mjs')], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'ms-cl-')), SMTP_HOST: '', MAIL_PROVIDER: '', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-password-1', SEED_DEMO: 'false', SKIP_CATALOG_IMPORT: 'true', APP_SECRET: 'x' }, stdio: ['ignore', 'pipe', 'inherit'] });
    srv.stdout.on('data', d => { if (String(d).includes('myshowroom by')) resolve(); });
    srv.on('exit', c => reject(new Error('server exited ' + c)));
  });
  assert.equal((await req('admin', 'POST', '/api/auth/login', { email: 'admin@test.local', password: 'admin-password-1' })).status, 200);
  assert.equal((await req('admin', 'POST', '/api/users', { name: 'Giulia', email: 'giulia@test.local', role: 'consultant', site: 'Milano', password: 'password-giulia-1' })).status, 201);
  assert.equal((await req('giulia', 'POST', '/api/auth/login', { email: 'giulia@test.local', password: 'password-giulia-1' })).status, 200);
});
after(() => srv.kill());

test('riconoscimento biglietto: campi principali', () => {
  const f = parseBusinessCard('STUDIO ARKÈ\nMarco Bianchi\nArchitetto - Socio fondatore\nVia Borgonuovo 12, 20121 Milano\nTel. +39 02 8645 1234\nMob. +39 335 712 4488\nm.bianchi@studioarke it\nwww.studioarke.it');
  assert.deepEqual(f, { name: 'Marco Bianchi', company: 'STUDIO ARKÈ', role: 'Architetto - Socio fondatore', email: 'm.bianchi@studioarke.it', phone: '+39 02 8645 1234', mobile: '+39 335 712 4488', website: 'www.studioarke.it', address: 'Via Borgonuovo 12, 20121 Milano' });
  const g = parseBusinessCard('AHMED AL MANSOORI\nHead of Procurement\nEmaar Properties PJSC\nT +971 4 367 3333 | M +971 50 123 4567\nahmed.mansoori@emaar.ae');
  assert.equal(g.name, 'Ahmed Al Mansoori'); assert.equal(g.mobile, '+971 50 123 4567'); assert.equal(g.phone, '+971 4 367 3333'); assert.equal(g.company, 'Emaar Properties PJSC');
});

test('nuovo contatto con campi ampliati e foto del biglietto', async () => {
  const f = (await req('giulia', 'POST', '/api/files', jpg, { 'Content-Type': 'image/jpeg', 'X-File-Name': 'Biglietto.jpg' })).body;
  const r = await req('giulia', 'POST', '/api/clients', { name: 'Marco Bianchi', company: 'Studio Arkè', role: 'Architetto', email: 'm.bianchi@studioarke.it', mobile: '+39 335 712 4488', website: 'studioarke.it', address: 'Via Borgonuovo 12, Milano', site: 'Milano', source: 'biglietto', cardFileId: f.id });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.company, 'Studio Arkè'); assert.equal(r.body.source, 'biglietto'); assert.equal(r.body.cardFileId, f.id);
  assert.equal(r.body.privacySignedAt, null); assert.equal(r.body.marketingConsent, null);
  const boot = (await req('giulia', 'GET', '/api/bootstrap')).body;
  assert.equal(boot.clients.find(c => c.id === r.body.id).mobile, '+39 335 712 4488');
  const pdf = (await req('giulia', 'POST', '/api/files', new Uint8Array(Buffer.from('%PDF-1.4 x')), { 'Content-Type': 'application/pdf' })).body;
  assert.equal((await req('giulia', 'PATCH', `/api/clients/${r.body.id}`, { cardFileId: pdf.id })).status, 400, 'il biglietto deve essere un’immagine');
});

test('informativa: bozza predefinita, modificabile solo dall’amministratore', async () => {
  const d = (await req('giulia', 'GET', '/api/settings/privacy')).body;
  assert.equal(d.isDefault, true); assert.match(d.text, /art\. 13/); assert.match(d.version, /^[0-9a-f]{12}$/);
  assert.equal((await req('giulia', 'PUT', '/api/settings/privacy', { text: 'x' })).status, 403);
  const u = (await req('admin', 'PUT', '/api/settings/privacy', { text: d.text.replace('[RAGIONE SOCIALE]', 'Peverelli Arredamenti S.r.l.') })).body;
  assert.equal(u.isDefault, false); assert.notEqual(u.version, d.version);
  assert.match((await req('giulia', 'GET', '/api/settings/privacy')).body.text, /Peverelli Arredamenti S\.r\.l\./);
});

test('modulo privacy: firma obbligatoria, PDF generato, consenso registrato, cancellazione completa', async () => {
  const c = (await req('giulia', 'GET', '/api/bootstrap')).body.clients[0];
  assert.equal((await req('giulia', 'POST', `/api/clients/${c.id}/consent`, { readAccepted: true, marketing: true })).status, 400);
  assert.equal((await req('giulia', 'POST', `/api/clients/${c.id}/consent`, { readAccepted: false, marketing: true, signature: sig })).status, 400);
  assert.equal((await req('giulia', 'POST', `/api/clients/${c.id}/consent`, { readAccepted: true, signature: sig })).status, 400);
  const r = await req('giulia', 'POST', `/api/clients/${c.id}/consent`, { readAccepted: true, marketing: false, signature: sig, sendCopy: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.client.marketingConsent, false); assert.ok(r.body.client.privacySignedAt); assert.match(r.body.client.privacyVersion, /^[0-9a-f]{12}$/);
  assert.equal(r.body.email.status, 'outbox');
  const pdf = (await req('giulia', 'GET', `/api/files/${r.body.client.consentFileId}`)).body;
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), '%PDF-');
  // seconda firma: sostituisce il modulo precedente
  const r2 = await req('giulia', 'POST', `/api/clients/${c.id}/consent`, { readAccepted: true, marketing: true, signature: sig });
  assert.equal(r2.body.client.marketingConsent, true);
  assert.equal((await req('giulia', 'GET', `/api/files/${r.body.client.consentFileId}`)).status, 404, 'modulo precedente rimosso');
  // cancellazione: rimuove anche modulo e foto del biglietto
  assert.equal((await req('giulia', 'DELETE', `/api/clients/${c.id}`)).status, 200);
  assert.equal((await req('admin', 'GET', `/api/files/${r2.body.client.consentFileId}`)).status, 404);
  assert.equal((await req('admin', 'GET', `/api/files/${c.cardFileId}`)).status, 404);
});
