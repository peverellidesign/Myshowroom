// Archiviazione file: disco locale (sviluppo / server singolo) o object storage S3-compatibile
// (AWS S3, Cloudflare R2, Backblaze B2, MinIO, Scaleway, ...). Firma AWS Signature V4 senza SDK.
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BlobStorage } from '../core/deps';

export class DiskStorage implements BlobStorage {
  readonly kind = 'disk';
  constructor(private root: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('chiave non valida');
    return full;
  }
  async put(key: string, data: Uint8Array) { const f = this.p(key); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, data); }
  async get(key: string) { try { return new Uint8Array(await readFile(this.p(key))); } catch { return null; } }
  async delete(key: string) { await rm(this.p(key), { force: true }); }
}

const sha256hex = (d: string | Uint8Array) => createHash('sha256').update(d).digest('hex');
const hmac = (k: string | Buffer, d: string) => createHmac('sha256', k).update(d).digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export type SignInput = { method: string; url: URL; headers: Record<string, string>; body: string | Uint8Array; region: string; service: string; accessKeyId: string; secretAccessKey: string; date: Date };

/** AWS Signature Version 4 — restituisce gli header firmati. */
export function signV4(i: SignInput): Record<string, string> {
  const amzDate = i.date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = i.headers['x-amz-content-sha256'] || sha256hex(i.body);
  const headers: Record<string, string> = { ...i.headers, host: i.url.host, 'x-amz-date': amzDate };
  if (i.service === 's3') headers['x-amz-content-sha256'] = payloadHash;
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const canonicalQuery = [...i.url.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalPath = i.service === 's3' ? i.url.pathname.split('/').map(s => rfc3986(decodeURIComponent(s))).join('/') : i.url.pathname || '/';
  const canonical = [i.method, canonicalPath, canonicalQuery, names.map(n => `${n}:${lower[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + i.secretAccessKey, day), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

export type S3Config = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string; pathStyle?: boolean };

export class S3Storage implements BlobStorage {
  readonly kind = 's3';
  constructor(private c: S3Config) {}
  private url(key: string) {
    const k = (this.c.prefix ? this.c.prefix.replace(/\/$/, '') + '/' : '') + key;
    const ep = new URL(this.c.endpoint);
    return this.c.pathStyle ? new URL(`${ep.origin}/${this.c.bucket}/${k}`) : new URL(`${ep.protocol}//${this.c.bucket}.${ep.host}/${k}`);
  }
  private async req(method: string, key: string, body: Uint8Array = new Uint8Array(), extra: Record<string, string> = {}) {
    const url = this.url(key);
    const headers = signV4({ method, url, headers: extra, body, region: this.c.region, service: 's3', accessKeyId: this.c.accessKeyId, secretAccessKey: this.c.secretAccessKey, date: new Date() });
    delete headers.host;
    return fetch(url, { method, headers, body: method === 'PUT' ? (body as Uint8Array<ArrayBuffer>) : undefined });
  }
  async put(key: string, data: Uint8Array, mime: string) {
    const r = await this.req('PUT', key, data, { 'content-type': mime });
    if (!r.ok) throw new Error(`S3 PUT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  async get(key: string) {
    const r = await this.req('GET', key);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 GET ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async delete(key: string) {
    const r = await this.req('DELETE', key);
    if (!r.ok && r.status !== 404) throw new Error(`S3 DELETE ${r.status}`);
  }
}
