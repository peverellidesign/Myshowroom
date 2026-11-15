// End-to-end test: people who receive an invite link sign up, confirm their
// email, recover a forgotten password — through real email links.
//
//   APP_URL=http://127.0.0.1:5173 SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   MAILPIT_URL=http://127.0.0.1:54324 node --test tests/onboarding.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || '/opt/node-tools/node_modules/playwright'); }

const APP = process.env.APP_URL || 'http://127.0.0.1:5173';
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const mail = n => `${n}.${run}@onboard.morethere.local`;
let browser;
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 } });

async function inviteFrom(name) {
  const email = mail(name); const password = 'Inviter-pass-1';
  await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  const { data, error } = await client.rpc('create_invitation');
  assert.ifError(error);
  return data[0].token;
}

// The latest email sent to this address, as text.
async function lastMail(to) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + to)}`).then(x => x.json());
    if (r.messages?.length) return fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`).then(x => x.json());
    await new Promise(r2 => setTimeout(r2, 250));
  }
  throw new Error('no email for ' + to);
}
const linkIn = m => (m.Text || m.HTML).match(/https?:\/\/[^\s"<>)]+verify[^\s"<>)]+/)[0].replace(/&amp;/g, '&');

before(async () => { browser = await playwright.chromium.launch(); });
after(async () => {
  await browser?.close();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of data?.users || []) if (u.email?.endsWith(`${run}@onboard.morethere.local`)) await admin.auth.admin.deleteUser(u.id);
});

test('an invite link opens straight on sign-up, and the invite waits after signing up', async () => {
  const token = await inviteFrom('Carla');
  const c = await phone(); const page = await c.newPage();
  await page.goto(`${APP}/#invite=${token}`);
  await page.getByText('Ti stanno aspettando.').waitFor();
  await page.getByLabel('COME TI CHIAMI?').fill('Dario');
  await page.getByLabel('EMAIL').fill(mail('dario'));
  await page.getByLabel('PASSWORD').fill('Dario-pass-123');
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByText('Carla ti invita nel suo Circle').waitFor();
  await page.getByRole('button', { name: 'Accetta' }).click();
  await page.locator('.toast', { hasText: 'Ora siete connessi' }).waitFor();
  await c.close();
});

test('the confirmation email opens in a new tab or another device and the invite is still there', async () => {
  const token = await inviteFrom('Elena');
  const email = mail('franco');

  // Sign-up with email confirmation: the app asks to check the mailbox and can resend.
  const c = await phone(); const page = await c.newPage();
  let redirect = '';
  await page.route('**/auth/v1/signup**', route => { redirect = new URL(route.request().url()).searchParams.get('redirect_to'); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email, confirmation_sent_at: new Date().toISOString() }) }); });
  await page.route('**/auth/v1/resend**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(`${APP}/#invite=${token}`);
  await page.getByLabel('COME TI CHIAMI?').fill('Franco');
  await page.getByLabel('EMAIL').fill(email);
  await page.getByLabel('PASSWORD').fill('Franco-pass-123');
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByText('Controlla la tua email.').waitFor();
  assert.equal(redirect, `${APP}/?invite=${token}`, 'the email link brings the invite back');
  await page.getByRole('button', { name: 'Invia di nuovo' }).click();
  await page.getByText('Email inviata di nuovo').waitFor();

  // The real link, opened on another device (nothing stored there).
  const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password: 'Franco-pass-123', options: { data: { display_name: 'Franco' }, redirectTo: redirect } });
  assert.ifError(error);
  const other = await phone(); const p2 = await other.newPage();
  await p2.goto(data.properties.action_link);
  await p2.getByText('Elena ti invita nel suo Circle').waitFor();
  assert.ok(!p2.url().includes('invite='), 'the token is removed from the address bar');
  await p2.getByRole('button', { name: 'Accetta' }).click();
  await p2.locator('.toast', { hasText: 'Ora siete connessi' }).waitFor();
  await c.close(); await other.close();
});

test('signing up again with an address that already has an account says so', async () => {
  const email = mail('hugo');
  const c = await phone(); const page = await c.newPage();
  // What Supabase answers when email confirmation is on: no session, a user without identities, no email.
  await page.route('**/auth/v1/signup**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000002', email, identities: [] }) }));
  await page.goto(APP);
  await page.getByRole('button', { name: 'Non hai un account? Creane uno' }).click();
  await page.getByLabel('COME TI CHIAMI?').fill('Hugo');
  await page.getByLabel('EMAIL').fill(email);
  await page.getByLabel('PASSWORD').fill('Hugo-pass-1234');
  await page.getByRole('button', { name: 'Crea account' }).click();
  await page.getByText('Esiste già un account con questa email').waitFor();
  assert.equal(await page.getByText('Controlla la tua email.').count(), 0);
  await page.getByRole('button', { name: 'Entra' }).waitFor();
  await c.close();
});

test('forgot password: real email, link opened on another device, new password works', async () => {
  const email = mail('gina');
  await admin.auth.admin.createUser({ email, password: 'Old-pass-1234', email_confirm: true, user_metadata: { display_name: 'Gina' } });
  const c = await phone(); const page = await c.newPage();
  await page.goto(APP);
  await page.getByRole('button', { name: 'Password dimenticata?' }).click();
  await page.getByLabel('EMAIL').fill(email);
  await page.getByRole('button', { name: 'Invia link' }).click();
  await page.getByText('riceverai un link').waitFor();

  const link = linkIn(await lastMail(email));
  const other = await phone(); const p2 = await other.newPage();
  await p2.goto(link);
  await p2.getByText('Scegli una nuova password.').waitFor();
  await p2.getByLabel('NUOVA PASSWORD').fill('New-pass-5678');
  await p2.getByRole('button', { name: 'Salva password' }).click();
  await p2.getByRole('button', { name: 'Il mio profilo' }).waitFor();

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  assert.ok((await client.auth.signInWithPassword({ email, password: 'New-pass-5678' })).data.session);
  assert.ok((await client.auth.signInWithPassword({ email, password: 'Old-pass-1234' })).error);

  // The same link a second time: a clear message and the way to ask for a new one.
  const p3 = await (await phone()).newPage();
  await p3.goto(link);
  await p3.getByText('Il link non è più valido').waitFor();
  await p3.getByRole('button', { name: 'Invia link' }).waitFor();
  await c.close(); await other.close();
});
