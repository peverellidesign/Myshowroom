// Server minimale che imita le rotte di Supabase Storage usate dall'app (verificate sul sorgente supabase/storage).
import http from 'node:http';
export function startFakeSupabaseStorage(port, key) {
  const objects = new Map();
  const server = http.createServer((req, res) => {
    if (req.headers.apikey !== key) { res.writeHead(401); return res.end('{"message":"Invalid API key"}'); }
    const u = decodeURIComponent(req.url);
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const body = Buffer.concat(chunks);
      let m;
      if (req.method === 'POST' && (m = u.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/))) {
        if (objects.has(m[2]) && req.headers['x-upsert'] !== 'true') { res.writeHead(400); return res.end('{"error":"Duplicate"}'); }
        objects.set(m[2], { data: body, type: req.headers['content-type'] }); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ Key: `${m[1]}/${m[2]}` }));
      }
      if (req.method === 'GET' && (m = u.match(/^\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/))) {
        const o = objects.get(m[2]); if (!o) { res.writeHead(400); return res.end('{"statusCode":"404","error":"not_found"}'); }
        res.writeHead(200, { 'content-type': o.type }); return res.end(o.data);
      }
      if (req.method === 'DELETE' && (m = u.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
        for (const p of JSON.parse(body.toString()).prefixes) objects.delete(p); res.writeHead(200); return res.end('[]');
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ objects, close: () => server.close() })));
}
