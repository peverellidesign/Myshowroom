// Test end-to-end delle API contro PostgreSQL reale, archivio su disco e server SMTP di test.
// Uso: TEST_DATABASE_URL=postgres://... node --test tests/api.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import postgres from 'postgres';
import { startSmtpSink } from './smtp-sink.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://myshowroom:myshowroom@127.0.0.1:5432/myshowroom_test';
const PORT = 3123, SMTP = 2526, BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(path.join(tmpdir(), 'ms-test-'));
let srv, sink;

function startServer() {
  return new Promise((resolve, reject) => {
    srv = spawn(process.execPath, [path.join(root, 'build/server.mjs')], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: path.join(tmp, 'uploads'), SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP), SMTP_SECURE: 'false', MAIL_FROM: 'Peverelli Design <showroom@test.local>', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-password-1', SEED_DEMO: 'true', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'inherit'] });
    srv.stdout.on('data', d => { if (String(d).includes('http://localhost')) resolve(); });
    srv.on('exit', c => reject(new Error('server exited ' + c)));
  });
}
const stopServer = () => new Promise(r => { srv.removeAllListeners('exit'); srv.on('exit', r); srv.kill('SIGTERM'); });

class Client {
  cookie = '';
  async req(method, url, body, headers = {}) {
    const isRaw = body instanceof Uint8Array;
    const r = await fetch(BASE + url, { method, headers: { 'X-Requested-With': 'myshowroom', ...(body && !isRaw ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers }, body: body ? (isRaw ? body : JSON.stringify(body)) : undefined });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const v = c.split(';')[0]; this.cookie = v.endsWith('=') ? '' : v; }
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()), headers: r.headers };
  }
  get(u) { return this.req('GET', u); } post(u, b, h) { return this.req('POST', u, b || {}, h); } patch(u, b) { return this.req('PATCH', u, b); } del(u) { return this.req('DELETE', u); }
}
const admin = new Client(), cons = new Client();
let catalogPdf;

before(async () => {
  const sql = postgres(DB, { onnotice: () => {} });
  await sql.unsafe('drop schema public cascade; create schema public;');
  await sql.end();
  sink = await startSmtpSink(SMTP, path.join(tmp, 'mail'));
  await startServer();
  const doc = await PDFDocument.create(); const f = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Catalogo Maxalto 2026 — test', { x: 50, y: 700, font: f, size: 18 });
  catalogPdf = await doc.save();
});
after(async () => { await stopServer(); sink.close(); });

test('health e protezione CSRF', async () => {
  assert.equal((await admin.get('/api/health')).body.ok, true);
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('autenticazione: login errato, login, me, accesso negato senza sessione', async () => {
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.local', password: 'sbagliata' })).status, 401);
  assert.equal((await new Client().get('/api/bootstrap')).status, 401);
  const r = await admin.post('/api/auth/login', { email: 'ADMIN@test.local', password: 'admin-password-1' });
  assert.equal(r.status, 200); assert.equal(r.body.user.role, 'admin');
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await admin.get('/api/auth/me')).body.user.email, 'admin@test.local');
});

test('gestione utenti e ruoli', async () => {
  const u = await admin.post('/api/users', { email: 'giulia@test.local', name: 'Giulia Consulente', role: 'consultant', site: 'Lugano', password: 'consulente-pass-1' });
  assert.equal(u.status, 201);
  assert.equal((await admin.post('/api/users', { email: 'giulia@test.local', name: 'X', role: 'consultant', password: 'consulente-pass-1' })).status, 409);
  assert.equal((await cons.post('/api/auth/login', { email: 'giulia@test.local', password: 'consulente-pass-1' })).status, 200);
  assert.equal((await cons.get('/api/users')).status, 403);
  assert.equal((await cons.post('/api/products', { brand: 'X' })).status, 403);
  const b = (await admin.get('/api/bootstrap')).body;
  assert.equal(b.products.length, 4); assert.equal(b.users.length, 2);
});

test('catalogo prodotti: creazione, modifica, validazione', async () => {
  const bad = await admin.post('/api/products', { brand: 'B&B Italia', name: 'Camaleonda', category: 'Inesistente', location: 'Como', status: 'Esposto', currency: 'EUR', configs: [{ name: 'A' }] });
  assert.equal(bad.status, 400);
  const p = await admin.post('/api/products', { brand: 'B&B Italia', name: 'Camaleonda', category: 'Sedute', location: 'Milano', zone: 'Living', status: 'Esposto', currency: 'EUR', dims: '254 × 98 × 74 cm', materials: ['Tessuto'], colors: ['Ecru'], images: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc'], configs: [{ name: 'Composizione 3 moduli', dims: '254 × 98 × 74 cm', price: 15800 }, { name: 'Composizione 4 moduli', dims: '342 × 98 × 74 cm', price: 19900 }] });
  assert.equal(p.status, 201); assert.equal(p.body.price, 15800); assert.equal(p.body.configs.length, 2);
  const e = await admin.patch('/api/products/' + p.body.id, { zone: 'Vetrina' });
  assert.equal(e.body.zone, 'Vetrina'); assert.equal(e.body.name, 'Camaleonda');
});

test('cataloghi PDF: upload, collegamento a più prodotti, download identico, rifiuto non-PDF', async () => {
  const up = await cons.post('/api/files', catalogPdf, { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('Catalogo Maxalto 2026.pdf') });
  assert.equal(up.status, 201); assert.equal(up.body.size, catalogPdf.byteLength);
  const fake = await cons.post('/api/files', new TextEncoder().encode('ciao'), { 'Content-Type': 'application/pdf' });
  assert.equal(fake.status, 400);
  assert.equal((await cons.post('/api/files', new Uint8Array([1, 2]), { 'Content-Type': 'application/zip' })).status, 415);
  const d = await cons.post('/api/documents', { name: 'Catalogo Maxalto 2026', type: 'Catalogo generale', language: 'Italiano', fileId: up.body.id, productIds: ['artemone', 'lithos'] });
  assert.equal(d.status, 201); assert.deepEqual(d.body.productIds.sort(), ['artemone', 'lithos']);
  const l = await cons.patch('/api/documents/' + d.body.id, { linkProductId: 'em' });
  assert.equal(l.body.productIds.length, 3);
  const u = await cons.patch('/api/documents/' + d.body.id, { unlinkProductId: 'em' });
  assert.equal(u.body.productIds.length, 2);
  const dl = await admin.get('/api/files/' + up.body.id + '?download=1');
  assert.equal(dl.status, 200); assert.deepEqual(Buffer.from(dl.body), Buffer.from(catalogPdf));
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const link = await admin.post('/api/documents', { name: 'Scheda online', type: 'Scheda tecnica', language: 'Inglese', externalUrl: 'https://example.com/scheda.pdf', productIds: ['em'] });
  assert.equal(link.status, 201);
  assert.equal((await cons.del('/api/documents/' + link.body.id)).status, 403);
  assert.equal((await admin.del('/api/documents/' + link.body.id)).status, 200);
});

let clientId;
test('clienti', async () => {
  const c = await cons.post('/api/clients', { name: 'Famiglia Rossi', email: '', phone: '+41 91 000 00 00', notes: 'Villa a Lugano, living e dining' });
  assert.equal(c.status, 201); clientId = c.body.id;
  assert.equal((await cons.post('/api/clients', { name: 'X', email: 'non-valida' })).status, 400);
  const e = await cons.patch('/api/clients/' + clientId, { notes: 'Villa a Lugano — preferenza tessuti chiari' });
  assert.match(e.body.notes, /tessuti chiari/);
});

let sentQuote;
test('preventivo: bozza per utente, articoli, PDF, invio email con allegati', async () => {
  const q = (await cons.get('/api/quotes/current')).body;
  const qa = (await admin.get('/api/quotes/current')).body;
  assert.notEqual(q.id, qa.id, 'ogni consulente ha la propria bozza');
  assert.equal((await cons.post(`/api/quotes/${q.id}/items`, { productId: 'bambole', configIndex: 1 })).status, 400, 'prezzo da verificare non ammesso');
  await cons.post(`/api/quotes/${q.id}/items`, { productId: 'bambole', configIndex: 0, material: 'Pelle', color: 'Sabbia' });
  const after2 = (await cons.post(`/api/quotes/${q.id}/items`, { productId: 'em', configIndex: 0, material: 'Legno', color: 'Nero' })).body;
  assert.equal(after2.items.length, 2);
  const p = (await cons.patch(`/api/quotes/${q.id}`, { clientId, currency: 'CHF', rate: 0.95 })).body;
  assert.equal(p.clientName, 'Famiglia Rossi');
  assert.equal(Math.round(p.total), Math.round(2350 + 3800 / 0.95));
  const pdf = await cons.post(`/api/quotes/${q.id}/pdf`);
  assert.equal(pdf.status, 200);
  const file = await cons.get('/api/files/' + pdf.body.fileId);
  const doc = await PDFDocument.load(file.body);
  assert.ok(doc.getPageCount() >= 1);
  const docs = (await cons.get('/api/bootstrap')).body.documents;
  const send = await cons.post(`/api/quotes/${q.id}/send`, { to: 'rossi@example.com', subject: 'La sua proposta Peverelli Design', body: 'Gentile Famiglia Rossi,\n\ngrazie per la visita.', showPrices: true, attachPdf: true, documentIds: [docs[0].id] });
  assert.equal(send.status, 200, JSON.stringify(send.body));
  assert.equal(send.body.email.status, 'sent');
  assert.match(send.body.quote.number, /^PD-\d{4}-0001$/);
  assert.equal(send.body.email.attachments.length, 2);
  assert.equal(send.body.nextDraft.items.length, 0);
  sentQuote = send.body.quote;
  await new Promise(r => setTimeout(r, 300));
  const msg = sink.messages.at(-1);
  assert.match(msg.to[0], /rossi@example.com/);
  assert.match(msg.raw, /Content-Type: application\/pdf/);
  assert.equal((msg.raw.match(/Content-Disposition: attachment/g) || []).length, 2);
  assert.match(msg.raw, /Proposta PD-\d{4}-0001/);
  assert.match(msg.raw, /Catalogo Maxalto 2026\.pdf/);
  // email del cliente salvata automaticamente
  assert.equal((await cons.get('/api/bootstrap')).body.clients.find(c => c.id === clientId).email, 'rossi@example.com');
  assert.equal((await cons.patch(`/api/quotes/${q.id}`, { subject: 'x' })).status, 409, 'preventivo inviato non modificabile');
});

test('storico preventivi visibile per ruolo e duplicazione', async () => {
  assert.equal((await cons.get('/api/quotes')).body.length, 1);
  assert.equal((await admin.get('/api/quotes')).body.length, 1);
  const g2 = new Client(); await admin.post('/api/users', { email: 'marco@test.local', name: 'Marco', role: 'consultant', password: 'consulente-pass-2' });
  await g2.post('/api/auth/login', { email: 'marco@test.local', password: 'consulente-pass-2' });
  assert.equal((await g2.get('/api/quotes')).body.length, 0, 'un consulente non vede i preventivi altrui');
  assert.equal((await g2.get('/api/quotes/' + sentQuote.id)).status, 403);
  const dup = await cons.post(`/api/quotes/${sentQuote.id}/duplicate`);
  assert.equal(dup.body.items.length, 2); assert.equal(dup.body.status, 'draft');
});

test('agenda: creazione, conflitto di fascia, conferma con invito .ics, prenotazione pubblica', async () => {
  const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const a = await cons.post('/api/appointments', { client: 'Famiglia Rossi', email: 'rossi@example.com', clientId, site: 'Lugano', type: 'Presentazione preventivo', date, time: '11:00', duration: '60', notes: '' });
  assert.equal(a.status, 201);
  const dup = await admin.post('/api/appointments', { client: 'Altro', site: 'Lugano', type: 'Visita showroom', date, time: '11:00', duration: '30' });
  assert.equal(dup.status, 409);
  const conf = await cons.post(`/api/appointments/${a.body.id}/confirm`);
  assert.equal(conf.body.status, 'sent');
  await new Promise(r => setTimeout(r, 200));
  assert.match(sink.messages.at(-1).raw, /text\/calendar/);
  const slots = (await new Client().get(`/api/public/slots?site=Lugano&date=${date}`)).body;
  assert.ok(!slots.times.includes('11:00') && slots.times.includes('10:00'));
  const pub = new Client();
  const book = await pub.post('/api/public/book', { client: 'Anna Bianchi', email: 'anna@example.com', site: 'Lugano', type: 'Visita showroom', date, time: '10:00', duration: '60' });
  assert.equal(book.status, 201);
  assert.equal((await pub.post('/api/public/book', { client: 'X', email: 'x@example.com', site: 'Lugano', type: 'Visita showroom', date, time: '10:00' })).status, 409);
  const appts = (await admin.get('/api/bootstrap')).body.appointments;
  assert.equal(appts.find(x => x.client === 'Anna Bianchi').source, 'online');
});

test('attività e riserve con permessi', async () => {
  const t = await cons.post('/api/tasks', { name: 'Richiamare Famiglia Rossi' });
  assert.equal((await cons.patch('/api/tasks/' + t.body.id, { done: true })).body.done, true);
  const r = await admin.post('/api/reservations', { productId: 'artemone', clientId });
  assert.equal(r.status, 201); assert.equal(r.body.client, 'Famiglia Rossi');
  assert.equal((await cons.post('/api/reservations', { productId: 'artemone' })).status, 409);
  assert.equal((await cons.post('/api/reservations', { productId: 'lithos' })).status, 409, 'già Riservato a catalogo');
  assert.equal((await cons.del('/api/reservations/artemone')).status, 403);
  assert.equal((await admin.del('/api/reservations/artemone')).status, 200);
});

test('assistente di ricerca su dati reali', async () => {
  const a = (await cons.post('/api/assistant', { q: 'Quali prodotti Maxalto abbiamo in magazzino?' })).body;
  assert.deepEqual(a.productIds.sort(), ['artemone', 'lithos']);
  assert.equal(a.mode, 'local');
  const b = (await cons.post('/api/assistant', { q: 'divani esposti a Milano' })).body;
  assert.equal(b.productIds.length, 1);
  const c = (await cons.post('/api/assistant', { q: 'tavoli presenti a Como' })).body;
  assert.deepEqual(c.productIds, ['em']);
});

test('persistenza dopo riavvio, cambio password, disattivazione utente', async () => {
  await stopServer(); await startServer();
  const b = (await admin.get('/api/bootstrap')); // la sessione sopravvive al riavvio (salvata in DB)
  assert.equal(b.status, 200);
  assert.equal(b.body.products.length, 5);
  assert.equal(b.body.documents.length, 1);
  assert.equal(b.body.quote.items.length, 0);
  assert.equal((await cons.post('/api/auth/password', { current: 'consulente-pass-1', next: 'nuova-password-123' })).status, 200);
  assert.equal((await new Client().post('/api/auth/login', { email: 'giulia@test.local', password: 'consulente-pass-1' })).status, 401);
  const users = (await admin.get('/api/users')).body;
  const giulia = users.find(u => u.email === 'giulia@test.local');
  await admin.patch('/api/users/' + giulia.id, { active: false });
  assert.equal((await cons.get('/api/bootstrap')).status, 401, 'sessioni invalidate');
  assert.equal((await new Client().post('/api/auth/login', { email: 'giulia@test.local', password: 'nuova-password-123' })).status, 401);
  assert.equal((await admin.patch('/api/users/' + (await admin.get('/api/auth/me')).body.user.id, { active: false })).status, 400);
  const emails = (await admin.get('/api/emails')).body;
  assert.ok(emails.length >= 3 && emails.every(e => e.status === 'sent'));
  assert.ok(readFileSync(sink.messages[0].file, 'latin1').length > 1000);
});
