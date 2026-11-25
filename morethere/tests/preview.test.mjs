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

import { tidyPreview } from '../preview.mjs';

test('Facebook: no view counts, a short title, the post as description, the author apart', () => {
  const p = tidyPreview({
    title: 'Visualizzazioni: 2,8 mln · Reazioni: 33.307 | Ran into NVIDIA CEO Jensen Huang on a NYC street… had to ask a few questions. One of the richest men in the world. | Adam Glyn',
    description: '',
  }, 'https://www.facebook.com/share/v/1KjML12i1y/');
  assert.equal(p.title, 'Ran into NVIDIA CEO Jensen Huang on a NYC street…');
  assert.match(p.description, /^Ran into NVIDIA CEO Jensen Huang on a NYC street… had to ask/);
  assert.equal(p.author, 'Adam Glyn');
  assert.equal(p.site, 'Facebook');
  assert.ok(!/Visualizzazioni|Reazioni/.test(p.title + p.description));
});

test('Instagram: the caption becomes the title, the name the author; login walls give no title', () => {
  const ig = tidyPreview({ title: 'Mario Rossi on Instagram: "Tramonto a Positano"', description: '' }, 'https://www.instagram.com/p/abc/');
  assert.deepEqual([ig.title, ig.author, ig.site], ['Tramonto a Positano', 'Mario Rossi', 'Instagram']);
  assert.equal(tidyPreview({ title: 'Facebook', description: '' }, 'https://m.facebook.com/x').title, '');
});

test('other sites keep their title; very long ones are shortened, the full text kept', () => {
  assert.equal(tidyPreview({ title: 'Trattoria da Mario — Milano', description: 'x' }, 'https://example.com/').title, 'Trattoria da Mario — Milano');
  const long = 'Parola '.repeat(40).trim();
  const t = tidyPreview({ title: long, description: '' }, 'https://example.com/');
  assert.ok(t.title.length <= 80 && t.title.endsWith('…'));
  assert.equal(t.description, long);
});

test('a caption is cut at its first sentence, also when an emoji ends it', () => {
  const p = tidyPreview({ title: 'Visualizzazioni: 35.043 · Reazioni: 1274 | A fresh look at our latest Italian finds 🇮🇹 From sculptural lighting to timeless mid-century furniture, every piece has its own character. | Raphael’s Midcentury', description: '' }, 'https://www.facebook.com/share/r/19s3874h98/');
  assert.equal(p.title, 'A fresh look at our latest Italian finds 🇮🇹');
  assert.equal(p.author, 'Raphael’s Midcentury');
});

test('generic pages of TikTok, YouTube, X are not taken as the post title', () => {
  assert.equal(tidyPreview({ title: 'TikTok - Make Your Day', description: 'TikTok - Make Your Day' }, 'https://www.tiktok.com/@a/video/1').title, '');
  assert.equal(tidyPreview({ title: 'YouTube', description: '' }, 'https://www.youtube.com/watch?v=1').title, '');
  assert.equal(tidyPreview({ title: 'Ricetta carbonara facile', description: '' }, 'https://www.tiktok.com/@a/video/1').title, 'Ricetta carbonara facile');
  assert.equal(tidyPreview({ title: 'Xbox: le novità', description: '' }, 'https://x.com/xbox').title, 'Xbox: le novità');
});
