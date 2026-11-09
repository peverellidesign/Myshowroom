// Link previews: GET /api/preview?url=... (signed-in users only).
//
// The page is fetched on the server because browsers block cross-origin reads.
// Safeguards against misuse as a proxy (SSRF):
//   * only http/https on the default ports, no credentials in the URL;
//   * every hostname is resolved and *all* its addresses must be public;
//     the connection is pinned to the address we checked (no DNS rebinding);
//   * redirects are re-checked hop by hop (max 3);
//   * 5 s timeout, 512 KB read limit, HTML only;
//   * per-user rate limit; results cached for an hour.

import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const ALLOW_PRIVATE = process.env.PREVIEW_ALLOW_PRIVATE === '1'; // tests only
const MAX_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)\b/i;
const TIMEOUT_MS = 5000;

const tokenCache = new Map(); // token -> { userId, exp }
const resultCache = new Map(); // url -> { value, exp }
const hits = new Map(); // userId -> timestamps

function ipv4ToInt(ip) { return ip.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0; }
function inV4(ip, cidr) {
  const [base, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
const V4_BLOCK = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];

export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return !V4_BLOCK.some(c => inV4(ip, c));
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (v === '::' || v === '::1') return false;
    if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8')) return false;
    return true;
  }
  return false;
}

async function resolvePublic(hostname) {
  const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addrs.length) throw new Error('unresolvable');
  if (!ALLOW_PRIVATE && !addrs.every(a => isPublicAddress(a.address))) throw new Error('blocked_address');
  return addrs[0];
}

function fetchOnce(url, kind = 'html') {
  return new Promise(async (resolve, reject) => {
    let target;
    try { target = await resolvePublic(url.hostname); } catch (e) { return reject(e); }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      timeout: TIMEOUT_MS,
      // Pin the connection to the address we checked. Node may ask for the list form.
      lookup: (_h, o, cb) => (o?.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family)),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; morethere-preview/1.0; +link preview)',
        Accept: kind === 'image' ? 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9' : kind === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
        'Accept-Language': 'it,en;q=0.8',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url) });
      }
      const type = String(res.headers['content-type'] || '');
      const okType = kind === 'image' ? IMAGE_TYPES.test(type) : kind === 'json' ? /json/i.test(type) : /text\/html|application\/xhtml/i.test(type);
      if (res.statusCode !== 200 || !okType) { res.resume(); return reject(new Error(`not_${kind}`)); }
      const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_BYTES;
      if (Number(res.headers['content-length'] || 0) > limit && kind === 'image') { res.destroy(); return reject(new Error('too_large')); }
      const chunks = []; let size = 0; let truncated = false;
      res.on('data', c => { size += c.length; if (size > limit) { truncated = true; res.destroy(); } else chunks.push(c); });
      res.on('close', () => (kind === 'image' && truncated ? reject(new Error('too_large')) : resolve({ body: Buffer.concat(chunks), type })));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function checkUrl(u) {
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad_scheme');
  if (u.username || u.password) throw new Error('credentials');
  if (u.port && !['80', '443'].includes(u.port) && !ALLOW_PRIVATE) throw new Error('bad_port');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').trim();

function meta(html, keys) {
  for (const key of keys) {
    const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (content) return decode(content[2] ?? content[3] ?? '');
  }
  return '';
}

export function parsePreview(html) {
  const head = html.slice(0, 200000);
  const title = meta(head, ['og:title', 'twitter:title']) || decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = meta(head, ['og:description', 'twitter:description', 'description']);
  const site = meta(head, ['og:site_name', 'application-name']);
  const image = meta(head, ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])
    || decode(head.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i)?.[0]?.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i)?.slice(2).find(Boolean) || '');
  return { title: title.slice(0, 300), description: description.slice(0, 600), site: site.slice(0, 80), image };
}

// Sites that serve automated visitors an empty page but publish oEmbed,
// the official way to describe a link (title, author, thumbnail).
const OEMBED = [
  [/^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/, 'https://www.youtube.com/oembed?format=json&url='],
  [/^(www\.)?vimeo\.com$/, 'https://vimeo.com/api/oembed.json?url='],
  [/^open\.spotify\.com$/, 'https://open.spotify.com/oembed?url='],
  [/^(www\.)?soundcloud\.com$/, 'https://soundcloud.com/oembed?format=json&url='],
  [/^(www\.)?flickr\.com$|^flic\.kr$/, 'https://www.flickr.com/services/oembed/?format=json&url='],
  [/^(www\.)?tiktok\.com$/, 'https://www.tiktok.com/oembed?url='],
];

async function getJson(raw) {
  let url = new URL(raw);
  for (let hop = 0; hop <= 3; hop++) {
    checkUrl(url);
    const r = await fetchOnce(url, 'json');
    if (r.redirect) { url = r.redirect; continue; }
    return JSON.parse(new TextDecoder('utf-8').decode(r.body));
  }
  throw new Error('too_many_redirects');
}

async function fromOembed(endpoint, pageUrl) {
  const d = await getJson(endpoint);
  const clean = v => (typeof v === 'string' ? decode(v) : '');
  return {
    title: clean(d.title).slice(0, 300),
    description: (clean(d.description) || (d.author_name ? `${clean(d.author_name)}` : '')).slice(0, 600),
    site: clean(d.provider_name).slice(0, 80),
    image: typeof d.thumbnail_url === 'string' ? d.thumbnail_url : '',
    url: pageUrl,
  };
}

function absolute(src, base) {
  if (!src) return '';
  try { const u = new URL(src, base); return ['http:', 'https:'].includes(u.protocol) && u.href.length <= 2048 ? u.href : ''; } catch { return ''; }
}

async function previewUncached(raw) {
  let url = new URL(raw);
  const provider = OEMBED.find(([host]) => host.test(url.hostname));
  if (provider) {
    try {
      const v = await fromOembed(provider[1] + encodeURIComponent(url.href), url.href);
      if (v.title || v.image) return { ...v, image: absolute(v.image, url) };
    } catch { /* fall back to the page itself */ }
  }
  for (let hop = 0; hop <= 3; hop++) {
    checkUrl(url);
    const r = await fetchOnce(url);
    if (r.redirect) { url = r.redirect; continue; }
    const charset = r.type.match(/charset=([\w-]+)/i)?.[1] || 'utf-8';
    let text;
    try { text = new TextDecoder(charset).decode(r.body); } catch { text = new TextDecoder('utf-8').decode(r.body); }
    const parsed = parsePreview(text);
    let value = { ...parsed, image: absolute(parsed.image, url), url: url.href };
    // Missing title or image: try the oEmbed description the page links to.
    if (!value.title || !value.image) {
      const tag = text.slice(0, 200000).match(/<link\b[^>]*type\s*=\s*["']application\/json\+oembed["'][^>]*>/i)?.[0];
      const href = tag?.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
      const endpoint = absolute(href ? decode(href[2] ?? href[3] ?? '') : '', url);
      if (endpoint) {
        try {
          const o = await fromOembed(endpoint, url.href);
          value = { ...value, title: value.title || o.title, description: value.description || o.description, site: value.site || o.site, image: value.image || absolute(o.image, url) };
        } catch { /* keep what we have */ }
      }
    }
    return value;
  }
  throw new Error('too_many_redirects');
}

export async function fetchPreview(raw) {
  const key = new URL(raw).href;
  const cached = resultCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.value;
  const value = await previewUncached(raw);
  if (resultCache.size > 500) resultCache.delete(resultCache.keys().next().value);
  resultCache.set(key, { value, exp: Date.now() + 3600_000 });
  return value;
}

export async function fetchImage(raw) {
  let url = new URL(raw);
  for (let hop = 0; hop <= 3; hop++) {
    checkUrl(url);
    const r = await fetchOnce(url, 'image');
    if (r.redirect) { url = r.redirect; continue; }
    return r;
  }
  throw new Error('too_many_redirects');
}

async function userFromToken(token) {
  const c = tokenCache.get(token);
  if (c && c.exp > Date.now()) return c.userId;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  if (tokenCache.size > 1000) tokenCache.clear();
  tokenCache.set(token, { userId: user.id, exp: Date.now() + 300_000 });
  return user.id;
}

function rateLimited(userId) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter(t => t > now - 600_000);
  list.push(now);
  hits.set(userId, list);
  return list.length > 60;
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

// Node http handler (also mounted in the Vite dev server).
export async function handlePreview(req, res) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const userId = token && await userFromToken(token);
    if (!userId) return json(res, 401, { error: 'unauthorized' });
    if (rateLimited(userId)) return json(res, 429, { error: 'rate_limited' });
    const target = new URL(req.url, 'http://x').searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target) || target.length > 2048) return json(res, 400, { error: 'bad_url' });
    return json(res, 200, await fetchPreview(target));
  } catch {
    return json(res, 200, { title: '', description: '', site: '' });
  }
}

// GET /api/preview-image?url=... — the page's cover image, fetched with the same
// safeguards, so the browser can store it as a private photo of the item.
export async function handlePreviewImage(req, res) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const userId = token && await userFromToken(token);
    if (!userId) return json(res, 401, { error: 'unauthorized' });
    if (rateLimited(userId)) return json(res, 429, { error: 'rate_limited' });
    const target = new URL(req.url, 'http://x').searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target) || target.length > 2048) return json(res, 400, { error: 'bad_url' });
    const img = await fetchImage(target);
    res.writeHead(200, {
      'Content-Type': img.type.split(';')[0],
      'Content-Length': img.body.length,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    return res.end(img.body);
  } catch {
    return json(res, 422, { error: 'image_unavailable' });
  }
}
