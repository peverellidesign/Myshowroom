// Minimal production server for the built app (dist/): static files,
// SPA fallback, long caching for hashed assets, and security headers.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 8080;
const supabase = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const wss = supabase.replace(/^https:/, 'wss:');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const headers = {
  'Content-Security-Policy': [
    "default-src 'self'",
    `connect-src 'self' ${supabase} ${wss}`.trim(),
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

async function send(res, file, cache) {
  const body = await readFile(file);
  res.writeHead(200, { ...headers, 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    const file = normalize(join(root, path));
    if (file.startsWith(root) && path !== '/' && (await stat(file).catch(() => null))?.isFile()) {
      return await send(res, file, path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    }
    return await send(res, join(root, 'index.html'), 'no-cache');
  } catch {
    res.writeHead(500); res.end();
  }
}).listen(port, () => console.log(`morethere listening on ${port}`));
