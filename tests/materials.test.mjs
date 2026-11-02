// Libreria materiali: collezioni e campioni, collegamento ai prodotti del marchio, campione nel preventivo e nel PDF.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://myshowroom:myshowroom@127.0.0.1:5432/myshowroom_test';
const PORT = 3127, BASE = `http://127.0.0.1:${PORT}`;
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAUAB4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzyiiipEFFFFABRRRQAUUUUAf/2Q==', 'base64');
let srv; const jar = { admin: '', cons: '' };
const req = async (who, method, url, body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const r = await fetch(BASE + url, { method, headers: { 'X-Requested-With': 'myshowroom', ...(jar[who] ? { cookie: jar[who] } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  for (const c of r.headers.getSetCookie()) jar[who] = c.split(';')[0];
  return { status: r.status, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};
const img = async who => (await req(who, 'POST', '/api/files', new Uint8Array(JPG), { 'Content-Type': 'image/jpeg' })).body.id;

before(async () => {
  const sql = postgres(DB, { onnotice: () => {} }); await sql.unsafe('drop schema public cascade; create schema public;'); await sql.end();
  await new Promise((resolve, reject) => {
    srv = spawn(process.execPath, [path.join(root, 'build/server.mjs')], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, UPLOAD_DIR: mkdtempSync(path.join(tmpdir(), 'ms-mat-')), SMTP_HOST: '', MAIL_PROVIDER: '', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-password-1', SEED_DEMO: 'false', SKIP_CATALOG_IMPORT: 'true', APP_SECRET: 'x' }, stdio: ['ignore', 'pipe', 'inherit'] });
    srv.stdout.on('data', d => { if (String(d).includes('myshowroom by')) resolve(); });
    srv.on('exit', c => reject(new Error('server exited ' + c)));
  });
  await req('admin', 'POST', '/api/auth/login', { email: 'admin@test.local', password: 'admin-password-1' });
  await req('admin', 'POST', '/api/users', { name: 'Cons', email: 'cons@test.local', role: 'consultant', site: 'Bulgarograsso', password: 'password-cons-1' });
  await req('cons', 'POST', '/api/auth/login', { email: 'cons@test.local', password: 'password-cons-1' });
});
after(() => srv.kill());

let col, flex, frau;
test('collezione: creazione, aggiornamento dei campioni, permessi', async () => {
  assert.equal((await req('cons', 'POST', '/api/materials/collections', { brand: 'Flexform', name: 'PELLE 411', swatches: [] })).status, 403);
  const a = await img('admin'), b = await img('admin');
  const r = await req('admin', 'POST', '/api/materials/collections', { brand: 'Flexform', category: 'Pelle', name: 'PELLE 411', swatches: [{ code: '400', name: 'Pelle 400', fileId: a }, { code: '405', name: 'Pelle 405', fileId: b }] });
  assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.added, 2);
  const r2 = await req('admin', 'POST', '/api/materials/collections', { brand: 'FLEXFORM', category: 'Pelle', name: 'pelle 411', swatches: [{ code: '405', name: 'Pelle 405 grafite', fileId: b }, { code: '850', name: 'Pelle 850' }] });
  assert.equal(r2.body.added, 1); assert.equal(r2.body.updated, 1); assert.equal(r2.body.collection.id, r.body.collection.id, 'stesso marchio e nome = stessa collezione');
  col = r2.body.collection;
  assert.deepEqual(col.swatches.map(s => s.code), ['400', '405', '850']);
  assert.equal((await req('admin', 'POST', '/api/materials/collections', { brand: 'X', name: 'Y', swatches: [{ code: '1', fileId: 'inesistente' }] })).status, 400);
  const boot = (await req('cons', 'GET', '/api/bootstrap')).body;
  assert.equal(boot.materials.length, 1); assert.equal(boot.materials[0].swatches.length, 3);
});

test('preventivo: campione del marchio accettato, foto nella riga e nel PDF; altri marchi rifiutati', async () => {
  flex = (await req('admin', 'POST', '/api/products', { brand: 'Flexform', name: 'Quincy', category: 'Sedute', location: 'Bulgarograsso', status: 'Esposto', currency: 'EUR', configs: [{ name: 'Divano', dims: '300 cm', price: 9000, listPrice: 12000 }] })).body;
  frau = (await req('admin', 'POST', '/api/products', { brand: 'Poltrona Frau', name: 'Archibald', category: 'Sedute', location: 'Como Città', status: 'Esposto', currency: 'EUR', configs: [{ name: 'Poltrona', dims: '83 cm', price: 3800 }] })).body;
  assert.ok(flex.id && frau.id, JSON.stringify(flex));
  const q = (await req('cons', 'GET', '/api/quotes/current')).body;
  const sw = col.swatches.find(s => s.code === '405');
  const r = await req('cons', 'POST', `/api/quotes/${q.id}/items`, { productId: flex.id, configIndex: 0, swatchId: sw.id });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const it = r.body.items[0];
  assert.equal(it.material, 'PELLE 411'); assert.equal(it.color, 'Pelle 405 grafite'); assert.equal(it.swatchFileId, sw.fileId);
  assert.equal((await req('cons', 'POST', `/api/quotes/${q.id}/items`, { productId: frau.id, configIndex: 0, swatchId: sw.id })).status, 400);
  const pdf = await req('cons', 'POST', `/api/quotes/${q.id}/pdf`);
  assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
  const file = (await req('cons', 'GET', `/api/files/${pdf.body.pdfFileId || pdf.body.id || pdf.body.fileId}`)).body;
  assert.equal(Buffer.from(file.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(Buffer.from(file).includes(Buffer.from('/Subtype /Image')) || Buffer.from(file).includes(Buffer.from('/Image')), 'immagine del campione nel PDF');
});

test('collezioni scelte nella scheda prodotto ed eliminazione', async () => {
  const p = (await req('admin', 'PATCH', `/api/products/${frau.id}`, { materialCollectionIds: [col.id] })).body;
  assert.deepEqual(p.materialCollectionIds, [col.id]);
  const q = (await req('cons', 'GET', '/api/quotes/current')).body;
  assert.equal((await req('cons', 'POST', `/api/quotes/${q.id}/items`, { productId: frau.id, configIndex: 0, swatchId: col.swatches.find(s => s.code === '850').id })).status, 201, 'collezione assegnata esplicitamente');
  assert.equal((await req('cons', 'DELETE', `/api/materials/collections/${col.id}`)).status, 403);
  assert.equal((await req('admin', 'DELETE', `/api/materials/collections/${col.id}`)).status, 200);
  assert.equal((await req('admin', 'GET', '/api/materials')).body.length, 0);
  const used = col.swatches.find(s => s.code === '405').fileId, unused = col.swatches.find(s => s.code === '400').fileId;
  assert.equal((await req('admin', 'GET', `/api/files/${used}`)).status, 200, 'foto usata in un preventivo conservata');
  assert.equal((await req('admin', 'GET', `/api/files/${unused}`)).status, 404);
  assert.deepEqual((await req('admin', 'GET', '/api/bootstrap')).body.products.find(x => x.id === frau.id).materialCollectionIds, []);
});

test('provenienze per catalogo: un colore, più cataloghi, upsert idempotente', async () => {
  const a = await img('admin'), b = await img('admin');
  const body = { brand: 'Flexform', category: 'Pelle', name: 'Pelle', swatches: [{ code: '405', name: 'PELLE 405', fileId: a, sources: [{ catalog: 'PELLE 400', fileId: b, sha256: 'x1' }, { catalog: 'PELLE 402', fileId: b, sha256: 'x1' }] }] };
  const r = await req('admin', 'POST', '/api/materials/collections', body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const again = await req('admin', 'POST', '/api/materials/collections', { ...body, swatches: [{ ...body.swatches[0], sources: [{ catalog: 'PELLE 405', fileId: b }, { catalog: 'pelle 400', fileId: b }] }] });
  assert.equal(again.body.added, 0); assert.equal(again.body.updated, 1);
  const sw = again.body.collection.swatches;
  assert.equal(sw.length, 1, 'un solo colore per codice');
  assert.deepEqual(sw[0].sources.map(x => x.catalog), ['PELLE 400', 'PELLE 402', 'PELLE 405']);
  assert.equal((await req('admin', 'DELETE', `/api/materials/collections/${again.body.collection.id}`)).status, 200);
  assert.equal((await req('admin', 'GET', `/api/files/${b}`)).status, 404, 'foto delle provenienze rimosse con la collezione');
});
