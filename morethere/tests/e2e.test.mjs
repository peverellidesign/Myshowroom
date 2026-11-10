// End-to-end test: two real people using the app in separate browsers,
// against a real Supabase stack. Requires the Vite dev server to be running
// with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY pointing at that stack.
//
//   APP_URL=http://127.0.0.1:5173 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
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
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const toast = (page, text) => page.locator('.toast', { hasText: text }).waitFor({ timeout: 10000 });
const close = page => page.getByRole('button', { name: 'CHIUDI' }).click();
// The word "world" must not appear anywhere in the interface.
const noWorld = async page => assert.doesNotMatch(await page.locator('body').innerText(), /world/i, 'no "world" on screen');

async function signUp(page, p) {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Non hai un account? Creane uno' }).click();
  await page.getByLabel('COME TI CHIAMI?').fill(p.name);
  await page.getByLabel('EMAIL').fill(p.email);
  await page.getByLabel('PASSWORD').fill(p.password);
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByText('NUOVO INGRESSO').waitFor();
}

before(async () => {
  // A small page to test link previews (the dev server runs with PREVIEW_ALLOW_PRIVATE=1).
  pageServer = createServer((req, res) => {
    if (req.url.startsWith('/cover.png')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(readFileSync(PHOTO));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><head><title>fallback</title><meta property="og:title" content="Trattoria da Mario — Milano"><meta name="description" content="Cucina lombarda dal 1962"><meta property="og:image" content="/cover.png"></head><body></body></html>');
  });
  await new Promise(r => pageServer.listen(0, '127.0.0.1', r));
  pageUrl = `http://127.0.0.1:${pageServer.address().port}/trattoria`;
  browser = await playwright.chromium.launch();
  for (const n of Object.keys(people)) {
    ctx[n] = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
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
  assert.ok(await page.getByRole('button', { name: 'Design', exact: true }).isVisible(), 'custom collection imported');
  assert.equal(await page.evaluate(() => localStorage.getItem('mt_items')), null, 'device copy removed');
});

test('saving a link and a note works as in the prototype', async () => {
  const { page } = people.alice;
  await page.getByPlaceholder('Incolla un link o scrivi...').fill('https://www.example.org/ristorante');
  await page.getByPlaceholder('Incolla un link o scrivi...').press('Enter');
  await toast(page, 'Salvato nel tuo mondo');
  await page.locator('.item', { hasText: 'example.org' }).waitFor();
  await page.getByPlaceholder("Cerca nell'archivio...").fill('kyoto');
  assert.equal(await page.locator('.item').count(), 1);
  await page.getByPlaceholder("Cerca nell'archivio...").fill('');
  await page.reload();
  await page.locator('.item', { hasText: 'example.org' }).waitFor();
  assert.equal(await page.locator('.item').count(), 3, 'persisted on the server');
  await shot(page, '03-home');
});

test('link preview: real page title and cover image, stored as a private photo', async () => {
  const { page } = people.alice;
  await page.getByPlaceholder('Incolla un link o scrivi...').fill(pageUrl);
  await page.getByPlaceholder('Incolla un link o scrivi...').press('Enter');
  await toast(page, 'Salvato nel tuo mondo');
  const card = page.locator('.item', { hasText: 'Trattoria da Mario — Milano' });
  await card.waitFor({ timeout: 15000 });
  await card.locator('.preview img').waitFor({ timeout: 15000 });
  assert.ok(await card.locator('.preview img').evaluate(img => img.complete && img.naturalWidth > 0), 'cover image loads');
  assert.match(await card.locator('.preview img').getAttribute('src'), /\/storage\/v1\/object\/sign\/media\//, 'served from private storage, not the original site');
  await shot(page, '03a-link-preview');
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
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Rinomina' }).click();
  await page.getByLabel('Nuovo nome').fill('Design e casa');
  await page.getByLabel('Rinomina raccolta').getByRole('button', { name: 'Salva' }).click();
  await toast(page, 'Raccolta rinominata');
  await page.getByRole('button', { name: 'Design e casa', exact: true }).waitFor();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Elimina raccolta' }).click();
  await toast(page, 'Raccolta eliminata');
  assert.equal(await page.getByRole('button', { name: 'Design e casa', exact: true }).count(), 0);
});

test('More of me without anyone yet: add a person right there, by invite link', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await signUp(bob, people.bob);

  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await noWorld(alice);
  await alice.getByRole('button', { name: /More of me/ }).click();
  // No dead end: the first step is offered in place.
  await alice.getByText('Per prima cosa aggiungi la persona a cui vuoi mostrare qualcosa di te.').waitFor();
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
  await alice.getByRole('button', { name: 'Bob', exact: true }).click();
  await alice.getByRole('button', { name: 'Viaggi' }).click();
  await alice.getByLabel('PERMESSO').selectOption('save');
  await alice.locator('.toggle', { hasText: 'Uso con AI' }).click();
  await alice.getByRole('button', { name: 'Condividi', exact: true }).click();
  await toast(alice, 'Fatto: ora vede ciò che hai scelto');
  await alice.getByText('Chi vede qualcosa di te').waitFor();
  await shot(alice, '06-share-saved');

  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByRole('button', { name: /Alice/ }).click();
  await noWorld(bob);
  await bob.getByText('+ Save Kyoto inspiration').waitFor();
  // The photo in the shared collection is visible to Bob, through a signed URL.
  await bob.locator('.shared img.thumb').first().waitFor();
  assert.ok(await bob.locator('.shared img.thumb').first().evaluate(img => img.complete && img.naturalWidth > 0), 'shared photo loads');
  assert.equal(await bob.getByText('Idea segreta').count(), 0, 'private item not visible');
  assert.equal(await bob.getByText('example.org').count(), 0, 'item outside the grant not visible');
  await shot(bob, '07-person');
  await bob.getByText('+ Save Kyoto inspiration').click();
  await toast(bob, 'Salvato nel tuo archivio');

  await bob.getByRole('button', { name: 'Use with AI' }).click();
  await toast(bob, 'Contesto copiato');
  const ctxText = await bob.evaluate(() => navigator.clipboard.readText());
  assert.match(ctxText, /MORETHERE — SHARED CONTEXT/);
  assert.match(ctxText, /Kyoto inspiration/);
  assert.doesNotMatch(ctxText, /Idea segreta/);
});

test('revoking access is immediate', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await alice.getByRole('button', { name: 'Revoca' }).first().click();
  await toast(alice, 'Accesso revocato');
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
  await alice.locator('.item', { hasText: 'example.org' }).getByRole('button', { name: 'Condividi' }).click();
  await alice.getByRole('button', { name: 'Bob', exact: true }).click();
  assert.equal(await alice.getByRole('button', { name: 'Bob', exact: true }).getAttribute('aria-pressed'), 'true');
  await alice.getByLabel('LA TUA DEDICA').fill('Ci andiamo insieme?');
  await shot(alice, '08-more-for-you');
  await noWorld(alice);
  await alice.getByRole('button', { name: 'Invia la scoperta' }).click();
  await toast(alice, 'Pensiero inviato');
  // Bob has not reloaded: the badge comes from realtime sync.
  await bob.locator('.round .badge').waitFor({ timeout: 10000 });
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.getByText('Ci andiamo insieme?').waitFor();
  await shot(bob, '09-circle');
  await bob.getByRole('button', { name: '+ Salva nel mio archivio' }).click();
  await toast(bob, 'Salvato nel tuo archivio');
  await close(bob);
  await bob.locator('.item', { hasText: 'example.org' }).waitFor();
});

test('More of us: as many shared spaces as you like, started from a person', async () => {
  const alice = people.alice.page;
  const bob = people.bob.page;
  await alice.goto(APP);
  await alice.getByRole('button', { name: /Apri Your Circle/ }).click();
  await alice.getByRole('button', { name: /Bob/ }).click();
  await alice.getByRole('button', { name: /More of us/ }).click();
  // Bob is already chosen.
  assert.equal(await alice.getByRole('button', { name: 'Bob', exact: true }).getAttribute('aria-pressed'), 'true');
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
  await noWorld(alice);
  // The back arrow goes back one step at a time: space → More of us → Bob → Circle → home.
  const backArrow = alice.getByRole('button', { name: /^Indietro/ });
  await backArrow.click();
  await alice.getByRole('heading', { name: 'More of us.' }).waitFor();
  await backArrow.click();
  await alice.getByRole('heading', { name: 'Bob' }).waitFor();
  await backArrow.click();
  await alice.getByRole('heading', { name: "There's more to us." }).waitFor();
  await backArrow.click();
  await alice.getByText('NUOVO INGRESSO').waitFor();

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
  // Tapping a discovery opens it.
  await alice.locator('.item', { hasText: 'Aggiunto da Bob' }).locator('.itemtitle').click();
  await alice.getByRole('dialog').getByText('Aggiunto da Bob').waitFor();
  await alice.getByRole('dialog').getByRole('button', { name: 'Chiudi' }).click();

  // AI export respects Bob's consent.
  await alice.getByRole('button', { name: 'Use with AI' }).click();
  await toast(alice, 'Contesto copiato');
  let text = await alice.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /Kyoto inspiration/);
  assert.doesNotMatch(text, /From: Bob/);
  await bob.getByRole('tab', { name: /Persone/ }).click();
  await bob.locator('.toggle', { hasText: 'I miei contributi con AI' }).click();
  await alice.getByRole('tab', { name: /Persone/ }).click();
  await alice.getByText('Partecipa · AI consentita').waitFor({ timeout: 10000 });
  await shot(alice, '10d-space-people');
  await alice.getByRole('button', { name: 'Use with AI' }).click();
  await alice.waitForTimeout(300);
  text = await alice.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /From: Bob/);
});

test('profile: edit, export data, sign out', async () => {
  const alice = people.alice.page;
  await alice.goto(APP);
  // The profile is one tap away from the home page.
  await alice.getByRole('button', { name: 'Il mio profilo' }).click();
  // Profile photo: square, private, seen by her people.
  await alice.getByTestId('avatar-input').setInputFiles(EXIF_PHOTO);
  await toast(alice, 'Foto profilo aggiornata');
  await alice.locator('.profileHero img.faceImg').waitFor();
  assert.ok(await alice.locator('.profileHero img.faceImg').evaluate(img => img.complete && img.naturalWidth > 0), 'own photo loads');
  const bob = people.bob.page;
  await bob.goto(APP);
  await bob.getByRole('button', { name: /Apri Your Circle/ }).click();
  await bob.locator('.railItem', { hasText: 'Alice' }).locator('img.faceImg').waitFor({ timeout: 10000 });
  assert.ok(await bob.locator('.railItem', { hasText: 'Alice' }).locator('img.faceImg').evaluate(img => img.complete && img.naturalWidth > 0), 'Bob sees Alice\'s photo');
  await shot(bob, '11b-circle-with-photo');
  await alice.getByLabel('DI COSA TI OCCUPI').fill('Travel · Food · Architecture');
  await alice.getByRole('button', { name: 'Salva' }).click();
  await toast(alice, 'Profilo aggiornato');
  await shot(alice, '11-profile');
  // Back from the profile returns home, where the header shows her photo.
  await alice.getByRole('button', { name: /^Indietro/ }).click();
  await alice.locator('.round.me img.faceImg').waitFor();
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
