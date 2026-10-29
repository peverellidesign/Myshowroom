// Server Node.js di myshowroom by Peverelli Design.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../core/app';
import { ensureSeed, removeSampleClient } from '../core/seed';
import { applyListPrices, importCatalog, type CatalogImport } from '../core/importCatalog';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BlobStorage, Mailer } from '../core/deps';
import { createPgStore } from './pgStore';
import { checkSupabaseSchema, createSupabaseStore } from './supabaseStore';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { Store } from '../core/store';
import { DiskStorage, S3Storage, SupabaseStorage } from './storage';
import { GoDaddyGatewayMailer, MicrosoftGraphMailer, OutboxMailer, SmtpMailer } from './mailer';
import { ClaudeModel } from './llm';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const env = process.env;
// Nomi delle variabili indipendenti da maiuscole/minuscole (es. "Mail_from" vale come MAIL_FROM)
for (const [k, v] of Object.entries({ ...env })) { const K = k.toUpperCase(); if (K !== k && env[K] === undefined) env[K] = v; }
const prod = env.NODE_ENV === 'production';
const bool = (v: string | undefined, d: boolean) => v === undefined ? d : /^(1|true|yes|si)$/i.test(v);

function loadDotEnv() {
  const f = path.join(root, '.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadDotEnv();
  const port = Number(env.PORT || 3000);
  const dbUrl = env.DATABASE_URL;
  const supaUrl = env.SUPABASE_URL, supaKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  let store: Store, close: () => Promise<unknown> = async () => {};
  if (dbUrl) {
    // connessione diretta PostgreSQL (Render, server propri, Supabase via pooler)
    ({ store, close } = await createPgStore(dbUrl, path.join(root, 'server', 'schema.sql')));
  } else if (supaUrl && supaKey) {
    // API HTTPS di Supabase: per host che permettono solo traffico web in uscita (GoDaddy Node.js Hosting)
    const cfg = { restUrl: env.SUPABASE_REST_URL || `${supaUrl.replace(/\/$/, '')}/rest/v1`, key: supaKey };
    const problem = await checkSupabaseSchema(cfg);
    if (problem) { console.error(`[myshowroom] ${problem}`); process.exit(1); }
    store = createSupabaseStore(cfg);
  } else {
    console.error('Database non configurato: impostare DATABASE_URL oppure SUPABASE_URL + SUPABASE_SECRET_KEY');
    process.exit(1);
  }
  if (prod && (await store.count('users')) === 0 && (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10)) {
    console.error('[myshowroom] Primo avvio: impostare ADMIN_EMAIL e ADMIN_PASSWORD (almeno 10 caratteri).');
    process.exit(1);
  }

  // Archivio file: S3 se richiesto; altrimenti Supabase Storage quando l'app usa Supabase; altrimenti disco locale.
  const storageKind = env.STORAGE || (supaUrl && supaKey ? 'supabase' : 'disk');
  const storage: BlobStorage = storageKind === 'supabase'
    ? new SupabaseStorage(env.SUPABASE_STORAGE_URL || supaUrl!, supaKey!, env.SUPABASE_BUCKET || 'myshowroom')
    : storageKind === 's3'
    ? new S3Storage({ endpoint: env.S3_ENDPOINT || `https://s3.${env.S3_REGION || 'eu-central-1'}.amazonaws.com`, region: env.S3_REGION || 'eu-central-1', bucket: env.S3_BUCKET!, accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY!, prefix: env.S3_PREFIX, pathStyle: bool(env.S3_PATH_STYLE, false) })
    : new DiskStorage(path.resolve(env.UPLOAD_DIR || path.join(root, 'data', 'uploads')));
  if (storageKind === 'supabase' && !(supaUrl && supaKey)) { console.error('STORAGE=supabase richiede SUPABASE_URL e SUPABASE_SECRET_KEY'); process.exit(1); }
  if (storageKind === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) { console.error('STORAGE=s3 richiede S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY'); process.exit(1); }

  const microsoft = env.MAIL_PROVIDER === 'microsoft' || env.MAIL_PROVIDER === 'outlook';
  if (microsoft && !(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET))
    console.error('[myshowroom] Email Outlook non attiva: impostare MS_TENANT_ID, MS_CLIENT_ID e MS_CLIENT_SECRET.');
  const mailer: Mailer = microsoft && env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET
    ? new MicrosoftGraphMailer({ tenantId: env.MS_TENANT_ID, clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET, from: env.MAIL_FROM || undefined, loginUrl: env.MS_LOGIN_URL, graphUrl: env.MS_GRAPH_URL })
    : env.MAIL_PROVIDER === 'godaddy'
    ? new GoDaddyGatewayMailer(env.MAIL_GATEWAY_URL || undefined)
    : env.SMTP_HOST
    ? new SmtpMailer({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: bool(env.SMTP_SECURE, Number(env.SMTP_PORT) === 465), user: env.SMTP_USER, pass: env.SMTP_PASS }, env.MAIL_FROM || 'Peverelli Design <showroom@example.com>')
    : new OutboxMailer();

  const app = createApp({
    store, storage, mailer,
    llm: env.ANTHROPIC_API_KEY ? new ClaudeModel(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL || 'claude-haiku-5-5') : null,
    config: { publicUrl: env.PUBLIC_URL || '', linkSecret: env.APP_SECRET || createHash('sha256').update('myshowroom-links:' + (dbUrl || supaKey || '')).digest('hex'), secureCookies: bool(env.SECURE_COOKIES, prod), maxUploadMb: Number(env.MAX_UPLOAD_MB || 100), companyName: 'Peverelli Design', demo: false, publicBooking: bool(env.PUBLIC_BOOKING, true) },
    fetchImage: async url => {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const mime = r.headers.get('content-type') || '';
      if (!r.ok || !/image\/(jpeg|png)/.test(mime)) return null;
      return { data: new Uint8Array(await r.arrayBuffer()), mime };
    },
  });

  await ensureSeed(store, {
    admin: { email: env.ADMIN_EMAIL || 'admin@myshowroom.local', password: env.ADMIN_PASSWORD || 'myshowroom-admin', name: env.ADMIN_NAME || 'Amministratore' },
    demoData: bool(env.SEED_DEMO, !prod),
  });
  // Cataloghi preparati in server/import/<chiave>/products.json (importati una sola volta)
  const importDir = path.join(root, 'server', 'import');
  if (existsSync(importDir) && !bool(env.SKIP_CATALOG_IMPORT, false))
    for (const dir of readdirSync(importDir).sort()) {
      const file = path.join(importDir, dir, 'products.json');
      if (!existsSync(file)) continue;
      const raw = new Uint8Array(readFileSync(file));
      const manifest = JSON.parse(Buffer.from(raw).toString('utf8')) as CatalogImport;
      const added = await importCatalog(store, storage, manifest, raw,
        async name => new Uint8Array(await readFile(path.join(importDir, dir, path.basename(name)))));
      if (added) console.log(`[myshowroom] Catalogo "${dir}": importati ${added} prodotti.`);
      const priced = await applyListPrices(store, manifest);
      if (priced) console.log(`[myshowroom] Catalogo "${dir}": prezzo di listino aggiunto a ${priced} prodotti.`);
    }
  await removeSampleClient(store);
  setInterval(() => app.purgeSessions().catch(() => {}), 6 * 3600_000).unref();

  const dist = path.join(root, 'dist');
  const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const SEC: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'self' blob:; base-uri 'self'; form-action 'self'",
  };
  if (prod) SEC['Strict-Transport-Security'] = 'max-age=31536000';

  const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(dist, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    // file precompressi (es. motore OCR): servito il .gz con Content-Encoding, o decompresso se il client non accetta gzip
    const gz = file.startsWith(dist) && !existsSync(file) && existsSync(file + '.gz');
    if (!gz && (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory())) file = path.join(dist, 'index.html');
    if (!gz && !existsSync(file)) { res.writeHead(503); res.end('Frontend non compilato: eseguire npm run build'); return; }
    const ext = path.extname(file);
    const cache = ext === '.html' ? 'no-cache' : /\.[0-9A-Z]{8}\./i.test(file) || urlPath.startsWith('/ocr/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
    const headers: Record<string, string> = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ...SEC };
    if (gz) {
      const raw = readFileSync(file + '.gz');
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) { res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': String(raw.byteLength) }); res.end(raw); }
      else { const body = gunzipSync(raw); res.writeHead(200, { ...headers, Vary: 'Accept-Encoding', 'Content-Length': String(body.byteLength) }); res.end(body); }
      return;
    }
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  };

  const server = createServer(async (req, res) => {
    try {
      if (!req.url?.startsWith('/api/')) return serveStatic(req, res);
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const url = `${proto}://${req.headers.host || 'localhost'}${req.url}`;
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(url, {
        method: req.method, headers: req.headers as Record<string, string>,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined, duplex: 'half',
      } as RequestInit);
      const response = await app.fetch(request);
      const headers: Record<string, string | string[]> = { ...SEC };
      response.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(response.status, headers);
      if (response.body) Readable.fromWeb(response.body as never).pipe(res); else res.end();
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Errore interno del server' }));
    }
  });
  server.requestTimeout = 10 * 60_000; // upload cataloghi grandi
  server.listen(port, env.HOST || '0.0.0.0', () => console.log(`myshowroom by Peverelli Design → http://localhost:${port}  (database: ${dbUrl ? "postgres" : "supabase-https"}, storage: ${storage.kind}, email: ${mailer.mode})`));
  const stop = () => { server.close(); close().finally(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

main().catch(e => { console.error(e); process.exit(1); });
