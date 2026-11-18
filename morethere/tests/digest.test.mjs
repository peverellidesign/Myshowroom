// "In breve": the server asks Claude for key facts and why they matter.
// Claude is replaced by a local stand-in that answers like the Messages API,
// so the test checks what we send and how we read the answer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

let fake; const seen = [];
let answer = { points: ['Sculture luminose e mobili mid-century italiani', 'Nuovi arrivi disponibili a Tel Aviv'], why: 'Per la tua raccolta Design, pezzi da tenere d\'occhio.' };
before(async () => {
  fake = createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }));
    });
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
});
after(() => fake?.close());

test('asks Claude for Italian key facts with a JSON schema and reads them back', async () => {
  const { makeDigest } = await import('../digest.mjs');
  const d = await makeDigest({ url: 'https://www.facebook.com/share/r/x/', title: 'A fresh look at our latest Italian finds', description: 'From sculptural lighting…', text: '', interests: ['Design', 'Viaggi'] });
  assert.deepEqual(d, answer);
  const sent = seen.at(-1);
  assert.match(sent.url, /\/v1\/messages/);
  assert.equal(sent.body.model, 'claude-opus-5-5');
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.equal(sent.body.fallbacks, 'default');
  assert.match(sent.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.match(sent.body.system, /italiano/);
  assert.match(sent.body.messages[0].content, /Le raccolte di questa persona: Design, Viaggi/);
});

test('nothing useful back -> no digest; long answers are trimmed', async () => {
  const { makeDigest } = await import('../digest.mjs');
  answer = { points: [], why: '' };
  assert.equal(await makeDigest({ url: 'https://example.com/' }), null);
  answer = { points: ['a', 'b', 'c', 'd', 'e', 'f'], why: 'x'.repeat(500) };
  const d = await makeDigest({ url: 'https://example.com/' });
  assert.equal(d.points.length, 4);
  assert.equal(d.why.length, 300);
});

test('only signed-in people can ask', async () => {
  const { handleDigest } = await import('../digest.mjs');
  const r = await new Promise(resolve => {
    const res = { writeHead(status) { this.status = status; }, end(body) { resolve({ status: this.status, body }); } };
    handleDigest({ headers: {}, [Symbol.asyncIterator]: async function* () {} }, res);
  });
  assert.equal(r.status, 401);
});
