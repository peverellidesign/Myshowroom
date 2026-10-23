// Server S3 minimale per i test (stesso schema di URL di Supabase Storage: /storage/v1/s3/<bucket>/<chiave>).
import http from 'node:http';
export function startFakeS3(port, base = '/storage/v1/s3', bucket = 'myshowroom') {
  const objects = new Map(); const log = [];
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    log.push(`${req.method} ${req.url}`);
    if (!auth.startsWith('AWS4-HMAC-SHA256 Credential=') || !req.headers['x-amz-content-sha256'] || !req.headers['x-amz-date']) { res.writeHead(403); return res.end('missing signature'); }
    if (!req.url.startsWith(`${base}/${bucket}/`)) { res.writeHead(404); return res.end('NoSuchBucket'); }
    const key = decodeURIComponent(req.url.slice(base.length + bucket.length + 2));
    if (req.method === 'PUT') { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { objects.set(key, { data: Buffer.concat(chunks), type: req.headers['content-type'] }); res.writeHead(200); res.end(); }); return; }
    if (req.method === 'GET') { const o = objects.get(key); if (!o) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': o.type }); return res.end(o.data); }
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
    res.writeHead(405); res.end();
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ objects, log, close: () => server.close() })));
}
if (process.argv[1]?.endsWith('fake-s3.mjs')) startFakeS3(Number(process.argv[2] || 9000)).then(() => console.log('fake S3 pronto'));
