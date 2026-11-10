// Minimal production server for the built app (dist/): static files,
// SPA fallback, long caching for hashed assets, and security headers.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib';
import { handlePreview, handlePreviewImage } from './preview.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;
const supabase = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const wss = supabase.replace(/^https:/, 'wss:');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const headers = {
  'Content-Security-Policy': [
    "default-src 'self'",
    `connect-src 'self' ${supabase} ${wss}`.trim(),
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${supabase}`.trim(),
    "manifest-src 'self'", "worker-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Files are read and compressed once, then served from memory (the build is immutable).
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.txt']);
const memo = new Map(); // file -> { raw, br, gz }
async function load(file) {
  let entry = memo.get(file);
  if (!entry) {
    const raw = await readFile(file);
    entry = { raw };
    if (COMPRESSIBLE.has(extname(file)) && raw.length > 1024) {
      entry.br = brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      entry.gz = gzipSync(raw, { level: 9 });
    }
    memo.set(file, entry);
  }
  return entry;
}

async function send(req, res, file, cache) {
  const { raw, br, gz } = await load(file);
  const accept = String(req.headers['accept-encoding'] || '');
  const [body, encoding] = br && /\bbr\b/.test(accept) ? [br, 'br'] : gz && /\bgzip\b/.test(accept) ? [gz, 'gzip'] : [raw, null];
  res.writeHead(200, {
    ...headers,
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': cache,
    'Content-Length': body.length,
    ...(br || gz ? { Vary: 'Accept-Encoding' } : {}),
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (path === '/api/preview' && req.method === 'GET') return await handlePreview(req, res);
    if (path === '/api/preview-image' && req.method === 'GET') return await handlePreviewImage(req, res);
    const file = normalize(join(root, path));
    if (file.startsWith(root) && path !== '/' && (await stat(file).catch(() => null))?.isFile()) {
      const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : path === '/sw.js' ? 'no-cache' : 'public, max-age=300';
      return await send(req, res, file, cache);
    }
    return await send(req, res, join(root, 'index.html'), 'no-cache');
  } catch {
    res.writeHead(500); res.end();
  }
}).listen(port, () => console.log(`morethere listening on ${port}`));
