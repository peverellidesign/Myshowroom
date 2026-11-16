// Link previews: the page's own description, wherever it sits in <head>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePreview } from '../preview.mjs';

test('og: tags after a very long head (Wix, Shopify) are found', () => {
  const html = `<html><head><script>${'x'.repeat(300_000)}</script>`
    + '<meta property="og:title" content="Sirton Pharmaceuticals"><meta property="og:image" content="https://static.example.com/cover.png">'
    + `</head><body>${'y'.repeat(1000)}<meta property="og:image" content="https://wrong.example.com/body.png"></body></html>`;
  const p = parsePreview(html);
  assert.equal(p.title, 'Sirton Pharmaceuticals');
  assert.equal(p.image, 'https://static.example.com/cover.png', 'from <head>, not from the body');
});
