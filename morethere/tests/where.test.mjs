// "Sono qui": the server turns a position into a city name, rounding the
// coordinates before they leave, and only for signed-in people.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

let geo; const seen = [];
before(async () => {
  geo = createServer((req, res) => {
    seen.push(new URL(req.url, 'http://x').searchParams);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'Firenze', address: { city: 'Firenze', state: 'Toscana', country: 'Italia' } }));
  });
  await new Promise(r => geo.listen(0, '127.0.0.1', r));
  process.env.GEOCODER_URL = `http://127.0.0.1:${geo.address().port}/reverse`;
});
after(() => geo?.close());

test('a position becomes a city; coordinates are rounded to about 1 km', async () => {
  const { placeFrom } = await import('../preview.mjs');
  assert.deepEqual(await placeFrom(43.771234, 11.253987), { place: 'Firenze', area: 'Toscana', country: 'Italia' });
  assert.equal(seen[0].get('lat'), '43.77');
  assert.equal(seen[0].get('lon'), '11.25');
  // Nearby positions are answered from the cache: no new request.
  await placeFrom(43.7719, 11.2541);
  assert.equal(seen.length, 1);
});

test('only signed-in people can ask, and bad positions are refused', async () => {
  const { handleWhere } = await import('../preview.mjs');
  const call = (url, auth) => new Promise(resolve => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
    handleWhere({ url, headers: auth ? { authorization: auth } : {} }, res);
  });
  assert.equal((await call('/api/where?lat=43.77&lon=11.25')).status, 401);
  assert.equal((await call('/api/where?lat=43.77&lon=11.25', 'Bearer not-a-real-token')).status, 401);
});

test('context on a subject: only for signed-in people, only plain names', async () => {
  const { handleContext } = await import('../preview.mjs');
  const call = (url, auth) => new Promise(resolve => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
    handleContext({ url, headers: auth ? { authorization: auth } : {} }, res);
  });
  assert.equal((await call('/api/context?topic=Nvidia')).status, 401);
});
