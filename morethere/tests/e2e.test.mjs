// End-to-end test: two real people using the app in separate browsers,
// against a real Supabase stack. Requires the Vite dev server to be running
// with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY pointing at that stack.
//
//   APP_URL=http://127.0.0.1:5173 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }

const APP = process.env.APP_URL || 'http://127.0.0.1:5173';
const SHOTS = process.env.SCREENSHOT_DIR;
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const people = {
  alice: { email: `alice.${run}@e2e.morethere.local`, name: 'Alice', password: 'Alice-pass-123' },
  bob: { email: `bob.${run}@e2e.morethere.local`, name: 'Bob', password: 'Bob-pass-1234' },
};
let browser;
const ctx = {};
const PHOTO = fileURLToPath(new URL('../public/icon-512.png', import.meta.url));
const EXIF_PHOTO = fileURLToPath(new URL('./fixtures/photo-exif.jpg', import.meta.url));
let pageServer; let pageUrl;

const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // The app scrolls inside its frame: for a full-page picture, let the page grow for a moment.
  const full = !/sheet/.test(name);
  if (full) await page.addStyleTag({ content: 'html,body,#root,.app{height:auto!important;overflow:visible!important}.app>main{overflow:visible!important}', }).then(h => h.evaluate(n => n.setAttribute('data-shot', '1')));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
  if (full) await page.evaluate(() => document.querySelectorAll('style[data-shot]').forEach(n => n.remove()));
};
// Switch a toggle on (whatever its default).
const turnOn = async (page, text) => { const t = page.locator('.toggle', { hasText: text }); if (!(await t.locator('input').isChecked())) await t.click(); };
const toast = (page, text) => page.locator('.toast', { hasText: text }).waitFor({ timeout: 10000 });
const close = async page => {
  const exit = page.getByRole('button', { name: 'Chiudi procedura', exact: true });
  if (await exit.isVisible()) await exit.click();
  await page.getByRole('button', { name: 'Le mie scoperte' }).click();
};
// The word "world" must not appear anywhere in the interface.
const noWorld = async page => assert.doesNotMatch(await page.locator('body').innerText(), /world/i, 'no "world" on screen');

async function signUp(page, p) {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Crea un account' }).click();
  await page.getByLabel('COME TI CHIAMI?').fill(p.name);
  await page.getByLabel('EMAIL').fill(p.email);
  await page.getByLabel('PASSWORD').fill(p.password);
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByLabel('Cerca o incolla un link').waitFor();
}

before(async () => {
  // A small page to test link previews (the dev server runs with PREVIEW_ALLOW_PRIVATE=1).
  pageServer = createServer((req, res) => {
    if (req.url.startsWith('/cover.png')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(readFileSync(PHOTO));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><head><title>fallback</title><meta property="og:title" content="Trattoria da Mario — Milano"><meta name="description" content="Cucina lombarda dal 1962"><meta property="og:image" content="/cover.png">'
      + '<script type="application/ld+json">{"@type":"Restaurant","servesCuisine":"Lombarda","address":{"streetAddress":"Via Solferino 12","addressLocality":"Milano"},"priceRange":"€€"}</script></head>'
      + '<body><p>Dal 1962 la Trattoria da Mario serve a Milano la cucina lombarda di casa, con il risotto giallo come piatto simbolo.</p></body></html>');
  });
  await new Promise(r => pageServer.listen(0, '127.0.0.1', r));
  pageUrl = `http://127.0.0.1:${pageServer.address().port}/trattoria`;
  browser = await playwright.chromium.launch();
  for (const n of Object.keys(people)) {
    ctx[n] = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
    // Trasferisci a AI opens Claude or ChatGPT in a new window: record where, offline.
    await ctx[n].addInitScript(() => { window.open = u => { window.__opened = String(u); return {}; }; });
    people[n].page = await ctx[n].newPage();
    people[n].page.on('pageerror', e => console.error(`[${n}] pageerror`, e.message));
  }
});

after(async () => {
  pageServer?.close();
  await browser?.close();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users || []) if (u.email?.endsWith(`${run}@e2e.morethere.local`)) await admin.auth.admin.deleteUser(u.id);
});

test('sign-up auth screen is shown first and the archive is empty and private', async () => {
  const { page } = people.alice;
  await page.goto(APP);
  await page.getByText('Bentornato nel tuo mondo.').waitFor();
  await shot(page, '01-auth');
});

test('on-device prototype data is imported only after consent', async () => {
  const { page } = people.alice;
  await page.evaluate(() => {
    localStorage.setItem('mt_items', JSON.stringify([
      { id: 'legacy-1', title: 'Kyoto inspiration', url: 'https://example.com/kyoto', note: '', category: 'Pagine', created: Date.now() - 86400000, collection: 'Viaggi' },
      { id: 'legacy-2', title: 'Idea segreta', url: '', note: 'Solo per me', category: 'Appunti', created: Date.now() - 3600000, collection: 'Idee' },
    ]));
    localStorage.setItem('mt_collections', JSON.stringify(['Idee', 'Viaggi', 'Posti da provare', 'Design']));
  });
  await signUp(page, people.alice);
  await page.getByText('Hai 2 scoperte salvate su questo dispositivo').waitFor();
  await shot(page, '02-import-offer');
  assert.equal(await page.locator('.item').count(), 0, 'nothing imported without consent');
  await page.getByRole('button', { name: 'Importa' }).click();
  await toast(page, '2 scoperte importate');
  await page.locator('.item', { hasText: 'Kyoto inspiration' }).waitFor();
  await page.getByRole('button', { name: 'Filtri' }).click();
  assert.ok(await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Design', exact: true }).isVisible(), 'custom collection imported');
  await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Chiudi' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('mt_items')), null, 'device copy removed');
});

test('saving a link and a note works as in the prototype', async () => {
  const { page } = people.alice;
  await page.getByPlaceholder('Cerca o incolla un link…').fill('https://www.example.org/ristorante');
  await page.getByPlaceholder('Cerca o incolla un link…').press('Enter');
  await toast(page, 'Salvato nella tua raccolta');
  await page.locator('.item', { hasText: 'example.org' }).waitFor();
  await page.getByPlaceholder('Cerca o incolla un link…').fill('kyoto');
  assert.equal(await page.locator('.item').count(), 1);
  await page.getByPlaceholder('Cerca o incolla un link…').fill('');
  await page.reload();
  await page.locator('.item', { hasText: 'example.org' }).waitFor();
  assert.equal(await page.locator('.item').count(), 3, 'persisted on the server');
  await shot(page, '03-home');
});

test('link preview: real page title and cover image, stored as a private photo', async () => {
  const { page } = people.alice;
  await page.getByPlaceholder('Cerca o incolla un link…').fill(pageUrl);
  await page.getByPlaceholder('Cerca o incolla un link…').press('Enter');
  await toast(page, 'Salvato nella tua raccolta');
  const card = page.locator('.item', { hasText: 'Trattoria da Mario — Milano' });
  await card.waitFor({ timeout: 15000 });
  await card.locator('.preview img').waitFor({ timeout: 15000 });
  assert.ok(await card.locator('.preview img').evaluate(img => img.complete && img.naturalWidth > 0), 'cover image loads');
  assert.match(await card.locator('.preview img').getAttribute('src'), /\/storage\/v1\/object\/sign\/media\//, 'served from private storage, not the original site');
  await shot(page, '03a-link-preview');
  // "In breve": the note becomes key facts and why it matters, worked out without AI.
  await card.locator('.itemtitle').click();
  // Laid out as a list ("In breve") and a card ("Perché ti interessa").
  await page.locator('.keyPoints li', { hasText: 'Cucina: Lombarda' }).waitFor({ timeout: 15000 });
  await page.locator('.keyPoints li', { hasText: 'Indirizzo: Via Solferino 12, Milano' }).waitFor();
  await page.locator('.keyPoints li', { hasText: 'Dal 1962 la Trattoria da Mario serve a Milano' }).waitFor();
  await page.locator('.whyCard', { hasText: 'Un indirizzo di cucina lombarda a Milano: da provare la prossima volta che ci passi.' }).waitFor();
  await close(page);
  // A second link about the same place gets its own judgment too.
  await page.getByPlaceholder('Cerca o incolla un link…').fill(`${pageUrl}-bis`);
  await page.getByPlaceholder('Cerca o incolla un link…').press('Enter');
  await toast(page, 'Salvato nella tua raccolta');
  // Read the saved note (the server keeps it), then remove the extra copy.
  let again;
  for (let k = 0; k < 40 && !again; k++) {
    const { data } = await admin.from('items').select('id, note').like('url', '%trattoria-bis%');
    again = data?.find(r => /Perché ti interessa: Ti stai avvicinando al buon cibo e ai ristoranti\. Un indirizzo di cucina lombarda a Milano/.test(r.note));
    if (!again) await page.waitForTimeout(500);
  }
  assert.ok(again, 'the second link has its judgment');
  // "Collegati": the other discovery about the same place, one tap away.
  await page.reload();
  await page.locator('.item', { hasText: 'Trattoria da Mario' }).first().locator('.itemtitle').click();
  await page.locator('.related .relatedRow', { hasText: 'Trattoria da Mario — Milano' }).waitFor();
  await shot(page, '03c-collegati');
  await close(page);
  await admin.from('items').delete().eq('id', again.id);
  await page.reload();
  await page.locator('.item', { hasText: 'Trattoria da Mario' }).first().locator('.itemtitle').click();
  await shot(page, '03b-in-breve');
  await close(page);
});

test('a new photo opens its memory in edit mode, dated from the camera', async () => {
  const { page } = people.alice;
  await page.locator('input[type=file]').setInputFiles(EXIF_PHOTO);
  await toast(page, 'Foto salvata');
  // The memory opens straight away, ready to be described.
  await page.locator('img.hero').waitFor();
  assert.equal(await page.getByLabel('DATA DEL RICORDO').inputValue(), '2019-08-15', 'date read from the camera data');
  assert.equal(await page.getByLabel('TITOLO').inputValue(), 'Foto del 15 agosto 2019');
  assert.ok(await page.getByLabel('TITOLO').evaluate(el => document.activeElement === el), 'title focused, ready to type');
  await page.getByLabel('TITOLO').fill('Tramonto a Kyoto');
  await page.getByLabel('NOTA').fill('Con Sofia, dopo il tempio. Il cielo era arancione.');
  await shot(page, '05a-new-photo-edit');
  await page.getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Modifiche salvate');
  await page.getByRole('heading', { name: 'Tramonto a Kyoto' }).waitFor();
  await page.getByText('Foto · 15 agosto 2019').waitFor();
  await close(page);
  const card = page.locator('.item', { hasText: 'Tramonto a Kyoto' });
  await card.locator('.preview img').waitFor();
  assert.ok(await card.locator('.preview img').evaluate(img => img.complete && img.naturalWidth > 0), 'thumbnail loads');
  assert.match(await card.locator('.preview img').getAttribute('src'), /\/storage\/v1\/object\/sign\/media\//, 'served by a signed URL');
  // "Per data" groups memories by month, oldest month last.
  await page.getByRole('button', { name: 'Per data' }).click();
  await page.locator('.monthLabel', { hasText: 'Agosto 2019' }).waitFor();
  const labels = await page.locator('.monthLabel').allInnerTexts();
  assert.equal(labels[labels.length - 1].toLowerCase(), 'agosto 2019');
  assert.ok(await page.locator('.monthGroup', { hasText: 'Agosto 2019' }).getByText('Tramonto a Kyoto').isVisible());
  await shot(page, '05b-by-date');
  await page.getByRole('button', { name: 'Recenti' }).click();
  // A second photo, to share later.
  await page.locator('input[type=file]').setInputFiles(PHOTO);
  await toast(page, 'Foto salvata');
  await page.locator('img.hero').waitFor();
  await page.getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Modifiche salvate');
  // Put it in the "Viaggi" collection so it can be shared later.
  await page.getByLabel('RACCOLTA').selectOption('Viaggi');
  await shot(page, '03b-photo-detail');
  await close(page);
});

test('edit an item, rename and delete a collection', async () => {
  const { page } = people.alice;
  await page.locator('.item', { hasText: 'Idea segreta' }).locator('.itemtitle').click();
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByLabel('TITOLO').fill('Idea segreta (rivista)');
  await page.getByLabel('NOTA').fill('Solo per me, aggiornata');
  await page.getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Modifiche salvate');
  await page.getByRole('heading', { name: 'Idea segreta (rivista)' }).waitFor();
  await close(page);
  await page.getByRole('button', { name: 'Filtri' }).click();
  await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Rinomina' }).click();
  await page.getByLabel('Nuovo nome').fill('Design e casa');
  await page.getByLabel('Rinomina raccolta').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Raccolta rinominata');
  await page.locator('.sectionLabel', { hasText: 'Design e casa' }).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Elimina raccolta' }).click();
  await toast(page, 'Raccolta eliminata');
  await page.locator('.sectionLabel', { hasText: 'Design e casa' }).waitFor({ state: 'detached' });
});

test('drag and drop: your own order, kept on every device', async () => {
  const { page } = people.alice;
  // Dynamic filters: themes and sources worked out from the discoveries themselves.
  await page.getByRole('button', { name: 'Filtri' }).click();
  await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Tema: Cibo' }).waitFor();
  await shot(page, '05b-filter-sheet');
  await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Fonte: Note' }).click();
  await page.getByRole('button', { name: /Togli il filtro Note/ }).waitFor();
  assert.ok(await page.locator('.cards .item', { hasText: 'Idea segreta' }).count() >= 1, 'notes filter shows notes');
  assert.equal(await page.locator('.cards .item', { hasText: 'Trattoria da Mario' }).count(), 0, 'and not links');
  await page.getByRole('button', { name: 'Filtri' }).click();
  await page.getByRole('dialog', { name: 'Filtri' }).getByRole('button', { name: 'Tema: Cibo' }).click();
  await page.locator('.cards .item', { hasText: 'Trattoria da Mario' }).first().waitFor();
  await shot(page, '05c-filters');
  await page.getByRole('button', { name: 'Tutti', exact: true }).click();
  const titles = () => page.locator('.cards .item .itemtitle').allInnerTexts();
  const start = await titles();
  assert.ok(start.length >= 3, 'enough discoveries to reorder');
  await page.getByText("Tieni premuta una scoperta e trascinala").waitFor();

  // With the mouse: the second card goes first.
  const cards = page.locator('.cards .item');
  await cards.nth(0).scrollIntoViewIfNeeded();
  // Wait until photos have loaded, so the cards do not move while we drag.
  await page.waitForFunction(() => [...document.querySelectorAll('.cards img')].every(i => i.complete));
  await page.waitForTimeout(300);
  const from = await cards.nth(1).locator('.itembody').boundingBox();
  const to = await cards.nth(0).locator('.itembody').boundingBox();
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(from.x + 20 + (to.x - from.x) * k / 12, from.y + 10);
  await page.mouse.up();
  const moved = [start[1], start[0], ...start.slice(2)];
  await page.waitForFunction(t => document.querySelector('.cards .item .itemtitle')?.innerText === t, moved[0]);
  assert.deepEqual(await titles(), moved);

  // A tap is still a tap: it opens the discovery, it does not move it.
  // (For 50 ms after a drop the library ignores clicks, so the drop never opens a card; no person taps that fast.)
  await page.waitForTimeout(200);
  await cards.nth(1).locator('.itemtitle').click();
  await page.getByRole('button', { name: 'Modifica' }).waitFor();
  await close(page);

  // Another device (a phone, by touch): same order; long press and drag the first card after the second.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p2 = await phone.newPage();
  await p2.goto(APP);
  await p2.getByLabel('EMAIL').fill(people.alice.email);
  await p2.getByLabel('PASSWORD').fill(people.alice.password);
  await p2.getByRole('button', { name: 'Entra' }).click();
  await p2.locator('.cards .item').first().waitFor();
  await p2.locator('.cards .item').first().scrollIntoViewIfNeeded();
  assert.deepEqual(await p2.locator('.cards .item .itemtitle').allInnerTexts(), moved, 'the order is saved');
  const a = await p2.locator('.cards .item').nth(0).locator('.itembody').boundingBox();
  const b = await p2.locator('.cards .item').nth(1).locator('.itembody').boundingBox();
  const cdp = await phone.newCDPSession(p2);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', a.x + 20, a.y + 10);
  await p2.waitForTimeout(600); // long press
  for (let k = 1; k <= 12; k++) await touch('touchMove', a.x + 20 + (b.x + b.width - 20 - a.x - 20) * k / 12, a.y + 10);
  await touch('touchEnd');
  const swapped = [moved[1], moved[0], ...moved.slice(2)]; // back to the starting order
  await p2.waitForFunction(t => document.querySelector('.cards .item .itemtitle')?.innerText === t, swapped[0]);
  assert.deepEqual(await p2.locator('.cards .item .itemtitle').allInnerTexts(), swapped);
  await phone.close();

  await page.reload();
  await page.locator('.cards .item').first().waitFor();
  assert.deepEqual(await titles(), swapped, 'back on the first device, the new order is there');
});

test('More of me without anyone yet: add a person right there, by invite link', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await signUp(bob, people.bob);

  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await noWorld(alice);
  await alice.getByRole('button', { name: /More of me/ }).click();
  // No dead end: the first step is offered in place.
  await alice.getByText('Prima aggiungi un amico: tocca Aggiungi.').waitFor();
  await alice.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const sheet = alice.getByRole('dialog', { name: 'Aggiungi una persona' });
  await sheet.getByRole('button', { name: 'Invita con un link' }).click();
  const link = await alice.getByLabel("Link d'invito").inputValue();
  assert.match(link, /#invite=[A-Za-z0-9_-]{40,}/);
  await shot(alice, '04-more-of-me-first-person');
  await noWorld(alice);

  await bob.goto(link);
  await bob.getByText('Alice ti invita nel suo Circle').waitFor();
  await shot(bob, '05-invite');
  await bob.getByRole('button', { name: 'Accetta' }).click();
  await toast(bob, 'Ora siete connessi');
  await bob.getByRole('button', { name: /Alice/ }).waitFor();

  // Reusing the link fails.
  await bob.goto(link);
  await bob.getByText('Invito non disponibile').waitFor();
  await bob.getByRole('button', { name: 'Ok' }).click();
});

test('More of me: the person sees exactly the chosen collection', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await alice.getByRole('dialog', { name: 'Aggiungi una persona' }).getByRole('button', { name: 'Chiudi' }).click();
  // Alice's screen updates by realtime sync: Bob is now one of her people.
  // A guided flow, one question at a time.
  await alice.getByRole('button', { name: 'Bob', exact: true }).click();
  await alice.getByRole('button', { name: /Avanti/ }).click();
  await alice.getByRole('heading', { name: 'Cosa può vedere Bob?' }).waitFor();
  await alice.getByRole('checkbox', { name: /Viaggi/ }).click();
  // Two steps: who, then what they see and can do, on the same screen.
  await turnOn(alice, 'Bob può salvarne una copia');
  await turnOn(alice, "Può usarle con l'AI");
  await shot(alice, '06a-more-of-me-step2');
  await alice.getByRole('button', { name: 'Aggiungi Bob' }).click();
  await alice.getByRole('heading', { name: 'Fatto.' }).waitFor();
  await shot(alice, '06-share-saved');

  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /Alice/ }).click();
  await noWorld(bob);
  await bob.getByRole('button', { name: 'Salva Kyoto inspiration' }).waitFor();
  // The photo in the shared collection is visible to Bob, through a signed URL.
  await bob.locator('.shared img.thumb').first().waitFor();
  assert.ok(await bob.locator('.shared img.thumb').first().evaluate(img => img.complete && img.naturalWidth > 0), 'shared photo loads');
  assert.equal(await bob.getByText('Idea segreta').count(), 0, 'private item not visible');
  assert.equal(await bob.getByText('example.org').count(), 0, 'item outside the grant not visible');
  await shot(bob, '07-person');
  await bob.getByRole('button', { name: 'Salva Kyoto inspiration' }).click();
  await toast(bob, 'Salvato nel tuo archivio');

  await bob.getByRole('button', { name: 'Trasferisci a AI' }).click();
  await shot(bob, '07b-ai-sheet');
  await bob.getByRole('dialog', { name: 'Trasferisci a AI' }).getByRole('button', { name: /ChatGPT/ }).click();
  await toast(bob, 'Apro ChatGPT');
  assert.match(await bob.evaluate(() => window.__opened), /^https:\/\/chatgpt\.com\/\?q=.*Kyoto/);
  const ctxText = await bob.evaluate(() => navigator.clipboard.readText());
  assert.match(ctxText, /MORETHERE — SHARED CONTEXT/);
  assert.match(ctxText, /Kyoto inspiration/);
  assert.doesNotMatch(ctxText, /Idea segreta/);
});

test('revoking access is immediate', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await alice.getByRole('button', { name: 'Torna a Your Circle' }).click();
  await alice.getByRole('button', { name: /More of me/ }).click();
  await alice.getByText('Amici nella tua raccolta').waitFor();
  await alice.getByRole('button', { name: 'Togli' }).first().click();
  await toast(alice, 'Tolto dalla tua raccolta');
  await bob.reload();
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /Alice/ }).click();
  await bob.getByText('Alice non condivide ancora nulla con te.').waitFor();
  await close(bob);
});

test('More for you arrives in real time', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await close(alice);
  await alice.locator('.item', { hasText: 'example.org' }).getByRole('button', { name: /^More for you/ }).click();
  await alice.getByRole('heading', { name: 'A quale amico?' }).waitFor();
  // Only friends and other apps here: adding people happens in Your Circle.
  assert.equal(await alice.getByRole('button', { name: 'Aggiungi', exact: true }).count(), 0);
  await shot(alice, '07b-more-for-you-friend');
  await alice.getByRole('button', { name: 'Bob', exact: true }).click();
  assert.equal(await alice.getByRole('button', { name: 'Bob', exact: true }).getAttribute('aria-pressed'), 'true');
  await alice.getByRole('button', { name: /Avanti/ }).click();
  // Opening a memory is a permission: Alice decides what Bob can do with it, next to the dedication.
  await alice.getByLabel('LA TUA DEDICA').fill('Ci andiamo insieme?');
  await turnOn(alice, 'Bob può salvarne una copia');
  // The chevron at the top goes back one step, and forward again.
  await alice.getByRole('button', { name: /^Indietro/ }).click();
  await alice.getByRole('heading', { name: 'A quale amico?' }).waitFor();
  await alice.getByRole('button', { name: /Avanti/ }).click();
  await alice.getByLabel('LA TUA DEDICA').waitFor();
  await shot(alice, '08-more-for-you');
  await noWorld(alice);
  await alice.getByRole('button', { name: 'Apri a Bob' }).click();
  await alice.getByRole('heading', { name: 'Fatto.' }).waitFor();
  await alice.getByText('Resta nella tua raccolta').waitFor();
  // Bob has not reloaded: the badge comes from realtime sync.
  await bob.locator('.tab .badge').waitFor({ timeout: 10000 });
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByText('Ricordi aperti per te').waitFor();
  await bob.getByText('Ci andiamo insieme?').waitFor();
  await shot(bob, '09-circle');
  await bob.getByRole('button', { name: '+ Salva nel mio archivio' }).click();
  await toast(bob, 'Salvato nel tuo archivio');
  await close(bob);
  await bob.locator('.item', { hasText: 'example.org' }).waitFor();
});

test('Chiedi consigli: Bob goes to Florence, Alice answers with her places', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /Chiedi consigli/ }).click();
  // "Sono qui": the phone says where Bob is; the server turns it into a city.
  await ctx.bob.grantPermissions(['geolocation']);
  await ctx.bob.setGeolocation({ latitude: 43.7712, longitude: 11.2539 });
  let asked = '';
  await bob.route('**/api/where**', route => { asked = route.request().url(); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ place: 'Firenze', area: 'Toscana', country: 'Italia' }) }); });
  await bob.getByRole('button', { name: 'Sono qui' }).click();
  await bob.getByRole('button', { name: 'Sei a Firenze' }).waitFor();
  await shot(bob, '09a0-here');
  assert.match(asked, /lat=43\.77.*lon=11\.25/);
  assert.equal(await bob.getByLabel('LA TUA RICHIESTA').inputValue(), 'A Firenze, adesso');
  await bob.getByLabel('LA TUA RICHIESTA').fill('Firenze, a maggio');
  await bob.getByLabel('DETTAGLI').fill('Ristoranti e posti tranquilli');
  await bob.getByRole('button', { name: /Avanti/ }).click();
  await bob.getByRole('heading', { name: 'A chi lo chiedi?' }).waitFor();
  assert.equal(await bob.getByRole('button', { name: 'Aggiungi', exact: true }).count(), 0);
  await bob.getByRole('button', { name: 'Alice', exact: true }).click();
  await shot(bob, '09a-ask');
  await bob.getByRole('button', { name: 'Chiedi', exact: true }).click();
  await bob.getByRole('heading', { name: 'Chiesto.' }).waitFor();
  await noWorld(bob);

  // Alice gets the request live and answers with two of her memories.
  await alice.goto(APP);
  await alice.getByPlaceholder('Cerca o incolla un link…').fill('Gelateria dei Neri, Firenze');
  await alice.getByRole('button', { name: 'Salva come nota', exact: true }).click();
  await alice.locator('.item', { hasText: 'Gelateria dei Neri' }).waitFor();
  await alice.locator('.tab .badge').waitFor({ timeout: 10000 });
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByText('Ti chiedono un consiglio').waitFor();
  await alice.getByText('Firenze, a maggio').waitFor();
  await alice.getByText('Bob è a Firenze').waitFor();
  await shot(alice, '09b-asked');
  await alice.getByRole('button', { name: 'Consiglia' }).click();
  await alice.getByRole('heading', { name: 'Cosa consigli a Bob?' }).waitFor();
  // Her places in Florence come first.
  await alice.locator('.pickLabel', { hasText: 'A Firenze' }).waitFor();
  assert.equal(await alice.locator('.pickTile').first().getAttribute('aria-label'), 'Gelateria dei Neri, Firenze');
  const tiles = alice.locator('.pickTile');
  await tiles.nth(0).click();
  await tiles.nth(1).click();
  const chosen = await Promise.all([0, 1].map(k => tiles.nth(k).getAttribute('aria-label')));
  // Like a chat: a TikTok she saved elsewhere, and a tip in her own words.
  const say = alice.getByLabel('Scrivi un consiglio o incolla un link');
  await say.fill('https://www.tiktok.com/@firenzefood/video/7300000000000000000');
  await say.press('Enter');
  await say.fill('Al mercato di Sant\'Ambrogio il lampredotto è il migliore');
  await alice.getByRole('button', { name: 'Aggiungi questo consiglio' }).click();
  await alice.locator('.bubble', { hasText: 'TikTok' }).waitFor();
  await alice.locator('.bubble', { hasText: 'lampredotto' }).waitFor();
  await shot(alice, '09c-answer-pick');
  await alice.getByRole('button', { name: /Avanti · 4/ }).click();
  await alice.getByLabel('IL TUO MESSAGGIO').fill('Da non perdere!');
  await alice.getByRole('button', { name: 'Manda 4 consigli' }).click();
  await alice.getByRole('heading', { name: 'Fatto.' }).waitFor();
  await noWorld(alice);

  // Bob finds the answers under his request, live.
  await bob.getByRole('button', { name: 'Apri la richiesta' }).click();
  await bob.getByRole('heading', { name: 'Firenze, a maggio' }).waitFor();
  for (const t of [...chosen, 'lampredotto', 'tiktok']) await bob.locator('.note', { hasText: t }).first().waitFor({ timeout: 10000 });
  await bob.getByText('Da non perdere!').first().waitFor();
  await shot(bob, '09d-answers');
  await bob.locator('.note', { hasText: chosen[0] }).getByRole('button', { name: '+ Salva nel mio archivio' }).click();
  await toast(bob, 'Salvato nel tuo archivio');
  // Answers live under the request, not mixed into "Ricordi aperti per te".
  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByText('Le tue richieste').waitFor();
  // Closed until opened, but new answers show on the closed line.
  await bob.getByRole('button', { name: /Le tue richieste/ }).click();
  await bob.getByRole('button', { name: /Firenze, a maggio/ }).getByText('4 consigli').waitFor();
  assert.equal(await bob.locator('.note', { hasText: 'Da non perdere!' }).count(), 0);
  await close(bob);
});

test('More of us: as many shared spaces as you like, started from a person', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await alice.goto(APP);
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByRole('button', { name: /Bob/ }).click();
  await alice.getByRole('button', { name: /More of us/ }).click();
  // Bob is already chosen: straight to the name.
  await alice.getByText('Con Bob. Riceveranno un invito.').waitFor();
  await noWorld(alice);
  await alice.getByLabel('COME LO CHIAMIAMO?').fill('Japan 2027');
  await alice.getByRole('button', { name: 'Crea lo spazio' }).click();
  await toast(alice, 'Lo spazio è pronto');
  await alice.getByRole('heading', { name: 'Japan 2027' }).waitFor();
  await alice.getByText('Lo spazio è ancora vuoto').waitFor();
  await shot(alice, '10b-space-empty');
  await alice.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const addSheet = alice.getByRole('dialog', { name: 'Aggiungi allo spazio' });
  await addSheet.getByRole('button', { name: 'Aggiungi Kyoto inspiration' }).click();
  await toast(alice, 'Aggiunto al vostro spazio');
  await addSheet.getByRole('button', { name: 'Già aggiunto: Kyoto inspiration' }).waitFor();
  await shot(alice, '10c-space-add-sheet');
  await addSheet.getByRole('button', { name: 'Fatto' }).click();
  await alice.locator('.item', { hasText: 'Kyoto inspiration' }).waitFor();
  // A cover photo of their choice.
  await alice.getByTestId('cover-input').setInputFiles(EXIF_PHOTO);
  await toast(alice, 'Copertina aggiornata');
  await alice.locator('.spaceHero .heroMosaic.n1 img').waitFor();
  assert.ok(await alice.locator('.spaceHero .heroMosaic img').evaluate(img => img.complete && img.naturalWidth > 0), 'cover loads');
  await alice.getByRole('button', { name: 'Cambia copertina' }).waitFor();
  await shot(alice, '10e-space-cover');
  await noWorld(alice);
  // The back arrow goes back one step at a time: space → More of us → Bob → Circle; then the tab bar goes home.
  const backArrow = alice.getByRole('button', { name: /^Indietro/ });
  await backArrow.click();
  await alice.getByRole('button', { name: /Nuovo spazio/ }).waitFor();
  await backArrow.click();
  await alice.getByRole('heading', { name: 'Bob' }).waitFor();
  await backArrow.click();
  await alice.getByRole('heading', { name: 'I tuoi amici' }).waitFor();
  assert.equal(await backArrow.count(), 0, 'Circle is a section: no back arrow');
  await alice.getByRole('button', { name: 'Le mie scoperte' }).click();
  await alice.getByLabel('Cerca o incolla un link').waitFor();

  // A second space with the same person.
  await alice.goto(APP);
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByRole('button', { name: /Bob/ }).click();
  await alice.getByRole('button', { name: /More of us/ }).click();
  await alice.getByLabel('COME LO CHIAMIAMO?').fill('Ristoranti a Milano');
  await alice.getByRole('button', { name: 'Crea lo spazio' }).click();
  await toast(alice, 'Lo spazio è pronto');
  await alice.getByRole('heading', { name: 'Ristoranti a Milano' }).waitFor();

  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /More of us/ }).click();
  await bob.locator('.person', { hasText: 'Japan 2027' }).getByRole('button', { name: 'Entra' }).click();
  await toast(bob, 'Benvenuto nel vostro spazio');
  // Bob sees the cover Alice chose, on the space card.
  await bob.locator('.spaceCard', { hasText: 'Japan 2027' }).locator('img').waitFor({ timeout: 10000 });
  await bob.locator('.person', { hasText: 'Ristoranti a Milano' }).getByRole('button', { name: 'Entra' }).click();
  await toast(bob, 'Benvenuto nel vostro spazio');
  await bob.getByRole('button', { name: /Japan 2027/ }).click();
  await bob.locator('.item', { hasText: 'Aggiunto da Alice' }).waitFor();
  await bob.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await bob.getByRole('dialog', { name: 'Aggiungi allo spazio' }).getByRole('button', { name: 'Aggiungi example.org' }).click();
  await toast(bob, 'Aggiunto al vostro spazio');
  await bob.getByRole('button', { name: 'Fatto' }).click();

  // Alice's page for Bob lists both spaces.
  await alice.goto(APP);
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByRole('button', { name: /Bob/ }).click();
  await alice.getByRole('button', { name: /Japan 2027/ }).waitFor();
  await alice.getByRole('button', { name: /Ristoranti a Milano/ }).waitFor();
  await shot(alice, '10a-person-spaces');
  await alice.getByRole('button', { name: /Japan 2027/ }).click();
  // Alice sees Bob's contribution.
  await alice.locator('.item', { hasText: 'Aggiunto da Bob' }).waitFor({ timeout: 10000 });
  await shot(alice, '10-space');
  // Filter by who added it, then order by date.
  await alice.getByRole('button', { name: 'Da Bob', exact: true }).click();
  await alice.locator('.item', { hasText: 'example.org' }).waitFor();
  assert.equal(await alice.locator('.item', { hasText: 'Kyoto inspiration' }).count(), 0, 'filtered out');
  await alice.locator('.spaceChips').getByRole('button', { name: /^Tutti/ }).click();
  await alice.getByRole('button', { name: 'Per data', exact: true }).click();
  await alice.locator('.spacePage .monthLabel').first().waitFor();
  assert.equal(await alice.locator('.spacePage .item').count(), 2, 'both back');
  await shot(alice, '10f-space-by-date');
  await alice.getByRole('button', { name: 'Recenti', exact: true }).click();
  // Tapping a discovery opens it.
  await alice.locator('.item', { hasText: 'Aggiunto da Bob' }).locator('.itemtitle').click();
  await alice.getByRole('dialog').getByText('Aggiunto da Bob').waitFor();
  await alice.getByRole('dialog').getByRole('button', { name: 'Chiudi' }).click();

  // AI export respects Bob's consent.
  await alice.getByRole('button', { name: 'Trasferisci a AI' }).click();
  await alice.getByRole('dialog', { name: 'Trasferisci a AI' }).getByRole('button', { name: /Claude/ }).click();
  await toast(alice, 'Apro Claude');
  assert.match(await alice.evaluate(() => window.__opened), /^https:\/\/claude\.ai\/new\?q=/);
  let text = await alice.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /Kyoto inspiration/);
  assert.doesNotMatch(text, /From: Bob/);
  await bob.getByRole('tab', { name: /Persone/ }).click();
  await bob.locator('.toggle', { hasText: 'I miei contributi con AI' }).click();
  await alice.getByRole('tab', { name: /Persone/ }).click();
  await alice.getByText('Partecipa · AI consentita').waitFor({ timeout: 10000 });
  await shot(alice, '10d-space-people');
  await alice.getByRole('button', { name: 'Trasferisci a AI' }).click();
  await alice.getByRole('dialog', { name: 'Trasferisci a AI' }).getByRole('button', { name: /Claude/ }).click();
  await alice.waitForTimeout(300);
  text = await alice.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /From: Bob/);
});

test('from a discovery straight into a shared space', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await close(alice);
  await alice.locator('.item', { hasText: 'Idea segreta' }).locator('.itemtitle').click();
  await alice.getByRole('button', { name: /More of us\. Invia a uno spazio condiviso/ }).click();
  const sheet = alice.getByRole('dialog', { name: 'More of us' });
  await sheet.getByRole('button', { name: 'Aggiungi a Japan 2027' }).click();
  await toast(alice, 'Aggiunto a Japan 2027');
  await sheet.getByRole('button', { name: 'Già in Japan 2027' }).waitFor();
  await shot(alice, '10g-to-space-sheet');
  await sheet.getByRole('button', { name: 'Chiudi' }).click();
  // Bob sees it in the space.
  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /More of us/ }).click();
  await bob.getByRole('button', { name: /Japan 2027/ }).click();
  await bob.locator('.item', { hasText: 'Idea segreta' }).first().waitFor({ timeout: 10000 });

  // Straight into the space from outside the collection: a TikTok and a note.
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByRole('button', { name: /More of us/ }).click();
  await alice.getByRole('button', { name: /Japan 2027/ }).click();
  await alice.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const add = alice.getByRole('dialog', { name: 'Aggiungi allo spazio' });
  const field = add.getByLabel('Incolla un link o scrivi una nota per lo spazio');
  await field.fill('https://www.tiktok.com/@tokyofood/video/7311111111111111111');
  await field.press('Enter');
  await toast(alice, 'Aggiunto al vostro spazio');
  await field.fill('Onsen a Hakone: prenotare con due mesi di anticipo');
  await add.getByRole('button', { name: 'Aggiungi allo spazio' }).click();
  await alice.locator('.toast', { hasText: 'Aggiunto al vostro spazio' }).last().waitFor();
  await shot(alice, '10h-space-add-outside-sheet');
  await add.getByRole('button', { name: 'Chiudi' }).click();
  await bob.locator('.item', { hasText: 'Onsen a Hakone' }).first().waitFor({ timeout: 10000 });
  await bob.locator('.item', { hasText: /TikTok/i }).first().waitFor({ timeout: 10000 });
  // They are in Alice's own collection too.
  await close(alice);
  await alice.locator('.item', { hasText: 'Onsen a Hakone' }).first().waitFor();
});

test('share to morethere from another app, and from morethere to other apps', async () => {
  const alice = people.alice.page;
  // The phone's share sheet cannot open in a headless browser: record what it would receive.
  await alice.addInitScript(() => {
    window.__shared = [];
    navigator.share = async d => { window.__shared.push({ title: d.title, text: d.text, files: (d.files || []).length }); window.__sharedFile = d.files?.[0] || null; };
    navigator.canShare = () => true;
  });
  // From Instagram (Android share sheet → /share-target → ?share=1…)
  await alice.goto(`${APP}/?share=1&title=Instagram&text=${encodeURIComponent('Guarda che posto https://www.example.org/da-instagram')}`);
  await toast(alice, 'Salvato nella tua raccolta');
  await alice.getByRole('heading', { name: 'example.org' }).waitFor();
  assert.doesNotMatch(alice.url(), /share=/, 'the address is cleaned');
  await alice.getByRole('link', { name: /Apri la fonte/ }).waitFor();
  await close(alice);
  // From an iPhone Shortcut or any link (?add=…)
  await alice.goto(`${APP}/?add=${encodeURIComponent('Un appunto dalle Note')}`);
  await toast(alice, 'Salvato nella tua raccolta');
  await alice.getByRole('heading', { name: 'Un appunto dalle Note' }).waitFor();
  await close(alice);
  // Out to other apps, straight to the share sheet.
  await alice.locator('.item', { hasText: 'example.org' }).first().getByRole('button', { name: /^More for you/ }).click();
  // One tap on "Fuori app" opens the phone's share sheet.
  await alice.getByRole('button', { name: 'Fuori app', exact: true }).click();
  await alice.getByRole('heading', { name: 'Condiviso.' }).waitFor();
  const shared = await alice.evaluate(() => window.__shared);
  assert.equal(shared.length, 1);
  assert.match(shared[0].text, /example\.org\/da-instagram/);
  assert.match(shared[0].text, /da morethere/);

  // A photo leaves with the morethere mark; the one in the archive stays as it was.
  await alice.goto(APP);
  const card = alice.locator('.item', { hasText: 'Trattoria da Mario' }).first();
  const original = await card.locator('.preview img').getAttribute('src');
  await card.getByRole('button', { name: /^More for you/ }).click();
  await alice.waitForFunction(() => document.querySelector('.chosenItem'));
  await alice.waitForTimeout(1500); // the marked copy is prepared in the background
  await alice.getByRole('button', { name: 'Fuori app', exact: true }).click();
  await alice.getByRole('heading', { name: 'Condiviso.' }).waitFor();
  const marks = await alice.evaluate(async (src) => {
    // Brightness in the bottom-right corner, where the mark goes, before and after.
    const corner = async blob => { const b = await createImageBitmap(blob); const c = new OffscreenCanvas(b.width, b.height); const x = c.getContext('2d'); x.drawImage(b, 0, 0); const w = Math.round(b.width * 0.35), h = Math.round(b.height * 0.08); const d = x.getImageData(b.width - w, b.height - h, w, h).data; let white = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) white++; return white; };
    const f = window.__sharedFile;
    return { type: f?.type, after: f ? await corner(f) : -1, before: await corner(await (await fetch(src)).blob()), data: f ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : '' };
  }, original);
  assert.equal(marks.type, 'image/jpeg');
  assert.ok(marks.after > marks.before + 50, `the mark is drawn (${marks.before} → ${marks.after} white pixels)`);
  if (SHOTS) writeFileSync(`${SHOTS}/12-shared-photo.jpg`, Buffer.from(marks.data.split(',')[1], 'base64'));
  assert.equal(await card.locator('.preview img').getAttribute('src').catch(() => original), original, 'the archive photo is unchanged');
});

test('Trasferisci a AI: only a trip, with the question already written', async () => {
  const alice = people.alice.page;
  await alice.goto(APP);
  await alice.getByRole('button', { name: 'AI: trasferisci le tue scoperte' }).click();
  await alice.getByRole('heading', { name: 'Cosa vuoi trasferire?' }).waitFor();
  await alice.getByRole('radio', { name: /Un luogo o un tema/ }).click();
  await alice.getByLabel('Luogo o tema').fill('kyoto');
  const rows = alice.locator('.aiRow');
  await rows.first().waitFor();
  const found = await rows.allInnerTexts();
  assert.ok(found.length >= 2 && found.every(t => /kyoto/i.test(t)), 'only Kyoto memories');
  await rows.last().click(); // leave one out
  await alice.getByRole('button', { name: 'Organizzami un itinerario' }).click();
  await shot(alice, '11c-ai');
  // Every time you choose between Claude and ChatGPT, on their official sites.
  await alice.getByRole('button', { name: new RegExp(`Trasferisci a AI · ${found.length - 1}`) }).click();
  const sheet = alice.getByRole('dialog', { name: 'Trasferisci a AI' });
  await sheet.getByText('claude.ai · sito ufficiale Anthropic').waitFor();
  await sheet.getByText('chatgpt.com · sito ufficiale OpenAI').waitFor();
  await shot(alice, '11d-ai-sheet');
  await sheet.getByRole('button', { name: /Claude/ }).click();
  await toast(alice, 'Apro Claude');
  assert.match(new URL(await alice.evaluate(() => window.__opened)).searchParams.get('q'), /My request: Organizzami un itinerario/);
  const text = await alice.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /Scope: everything about "kyoto"/);
  assert.match(text, /My request: Organizzami un itinerario/);
  assert.doesNotMatch(text, /example\.org/);
  assert.doesNotMatch(text, new RegExp(found[found.length - 1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('profile: edit, export data, sign out', async () => {
  const alice = people.alice.page;
  await alice.goto(APP);
  // The profile is one tap away from the home page, at the right edge of the bar.
  const pb = await alice.getByRole('button', { name: 'Il mio profilo' }).boundingBox();
  const vw = alice.viewportSize().width;
  assert.ok(vw - (pb.x + pb.width) < 40, `profile button sits at the right edge (${Math.round(pb.x + pb.width)} of ${vw})`);
  await alice.getByRole('button', { name: 'Il mio profilo' }).click();
  // Profile photo: square, private, seen by her people.
  await alice.getByTestId('avatar-input').setInputFiles(EXIF_PHOTO);
  await toast(alice, 'Foto profilo aggiornata');
  await alice.locator('.profileHero img.faceImg').waitFor();
  assert.ok(await alice.locator('.profileHero img.faceImg').evaluate(img => img.complete && img.naturalWidth > 0), 'own photo loads');
  // Tap the photo to see it large; tap again to close.
  await alice.getByRole('button', { name: 'Ingrandisci la tua foto' }).click();
  const big = alice.getByRole('dialog', { name: /Foto di Alice/ });
  await big.locator('img').waitFor();
  await alice.waitForTimeout(400); // the photo grows in
  assert.ok((await big.locator('img').boundingBox()).width > 300, 'shown large');
  await shot(alice, '11a-photo-large');
  await big.click();
  await big.waitFor({ state: 'detached' });
  const bob = people.bob.page;
  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.locator('.friendRow', { hasText: 'Alice' }).locator('img.faceImg').waitFor({ timeout: 10000 });
  // Faces load lazily: wait for the image to finish loading, then check it.
  const loaded = await bob.locator('.friendRow', { hasText: 'Alice' }).locator('img.faceImg').evaluate(img => (img.complete && img.naturalWidth > 0) || new Promise(r => { img.addEventListener('load', () => r(img.naturalWidth > 0)); img.addEventListener('error', () => r(false)); setTimeout(() => r(img.naturalWidth > 0), 8000); }));
  assert.ok(loaded, 'Bob sees Alice\'s photo');
  await shot(bob, '11b-circle-with-photo');
  await alice.getByLabel('DI COSA TI OCCUPI').fill('Travel · Food · Architecture');
  await alice.getByRole('button', { name: 'Salva' }).click();
  await toast(alice, 'Profilo aggiornato');
  await shot(alice, '11-profile');
  // Her photo is on the Profilo tab.
  await alice.getByRole('button', { name: 'Le mie scoperte' }).click();
  await alice.locator('.tabFace img.faceImg').waitFor();
  await shot(alice, '11c-home-with-profile');
  await alice.getByRole('button', { name: 'Il mio profilo' }).click();
  const [download] = await Promise.all([
    alice.waitForEvent('download'),
    alice.getByRole('button', { name: /Esporta i miei dati/ }).click(),
  ]);
  assert.match(download.suggestedFilename(), /^morethere-.*\.json$/);
  await alice.getByRole('button', { name: 'Esci' }).click();
  await alice.getByText('Bentornato nel tuo mondo.').waitFor();
});
