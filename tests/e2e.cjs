// Test dell'interfaccia con Playwright su desktop, iPad e iPhone + screenshot.
// Uso: node tests/e2e.cjs http://localhost:3000 ./screenshots
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('path');
const fs = require('fs');
const [base = 'http://localhost:3000', out = 'screenshots'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const errors = [];
const DEMO = process.env.E2E_DEMO === '1'; // nella demo ogni browser ha i propri dati
const log = (...a) => console.log('·', ...a);

async function newPage(browser, name, opts) {
  const ctx = await browser.newContext({ ...opts, locale: 'it-IT' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/images\.unsplash|ERR_TUNNEL|ERR_CONNECTION|ERR_NAME|net::|status of 40[13]/.test(m.text())) errors.push(`[${name}] console: ${m.text()}`); });
  page.on('dialog', d => d.accept());
  return page;
}
const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.png') });
async function login(p, email = 'admin@peverelli.demo', pw = 'myshowroom-demo') {
  await p.goto(base); await p.waitForSelector('.authPanel');
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', pw);
  await p.click('.authPanel button[type=submit]'); await p.waitForSelector('.shell .homeHero');
}
const nav = async (p, label) => {
  if (await p.locator('.bottomNav').isVisible() && await p.locator(`.bottomNav button:has-text("${label}")`).count()) return p.click(`.bottomNav button:has-text("${label}")`);
  if (await p.locator('.mobileMenu').isVisible()) { await p.click('.mobileMenu'); await p.waitForTimeout(250); }
  await p.click(`.sidebar .navItem:has-text("${label}")`);
};

(async () => {
  const browser = await chromium.launch();
  // ───── Desktop: flusso completo ─────
  const d = await newPage(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
  await d.goto(base); await d.waitForSelector('.authPanel'); await shot(d, 'desktop-01-login');
  await d.fill('input[type=email]', 'admin@peverelli.demo'); await d.fill('input[type=password]', 'errata-password');
  await d.click('.authPanel button[type=submit]'); await d.waitForSelector('.authPanel .error'); log('login errato → messaggio errore');
  await login(d); await shot(d, 'desktop-02-home'); log('login admin ok');

  // team: crea consulente
  await nav(d, 'Team'); await d.waitForSelector('text=Nuovo utente');
  if (!(await d.locator('text=giulia@peverelli.demo').count())) {
    const f = d.locator('.twoCols .panel').first();
    await f.locator('label:has(> span:text-matches("^Nome e cognome")) input').fill('Giulia Consulente');
    await f.locator('label:has(> span:text-matches("^Email")) input').fill('giulia@peverelli.demo');
    await f.locator('label:has(> span:text-matches("^Sede")) select').selectOption('Lugano');
    await f.locator('label:has(> span:text-matches("^Password temporanea")) input').fill('myshowroom-demo');
    await d.click('button:has-text("Crea utente")'); await d.waitForSelector('.teamRow:has-text("giulia@peverelli.demo")');
  }
  await shot(d, 'desktop-03-team'); log('team: consulente creato');

  // nuovo prodotto
  await nav(d, 'Prodotti'); await d.waitForSelector('.productGrid');
  if (!(await d.locator('.productCard:has-text("Camaleonda")').count())) {
    await d.click('button:has-text("Nuovo prodotto")');
    const m = d.locator('.modal');
    await m.locator('label:has(> span:text-matches("^Brand")) input').fill('B&B Italia');
    await m.locator('label:has(> span:text-matches("^Modello")) input').fill('Camaleonda');
    await m.locator('label:has(> span:text-matches("^Sede")) select').selectOption('Milano');
    await m.locator('label:has(> span:text-matches("^Zona")) input').fill('Living');
    await m.locator('label:has(> span:text-matches("^Dimensioni")) input').fill('254 × 98 × 74 cm');
    await m.locator('label:has(> span:text-matches("^Valuta")) select').selectOption('EUR');
    await m.locator('label:has(> span:text-matches("^Materiali")) input').fill('Tessuto, Velluto');
    await m.locator('label:has(> span:text-matches("^Colori")) input').fill('Ecru, Terracotta');
    await m.locator('.configRow input[aria-label="Misure"]').fill('254 × 98 × 74 cm');
    await m.locator('.configRow input[aria-label="Prezzo"]').fill('15800');
    await m.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'sofa.jpg'));
    await d.waitForSelector('.editThumbs img');
    await shot(d, 'desktop-04-nuovo-prodotto');
    await m.locator('button:has-text("Salva prodotto")').click();
    await d.waitForSelector('.productSummary h1:has-text("Camaleonda")');
  } else await d.click('.productCard:has-text("Camaleonda")');
  await d.waitForTimeout(400); await shot(d, 'desktop-05-scheda-prodotto'); log('prodotto creato con foto caricata');

  // catalogo PDF collegato
  await d.click('.tabs button:has-text("Cataloghi")');
  if (!(await d.locator('.document:has-text("Catalogo B&B Italia")').count())) {
    await d.locator('.uploadBox input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'catalogo.pdf'));
    await d.locator('label:has(> span:text-matches("^Nome documento")) input').fill('Catalogo B&B Italia 2026');
    await d.locator('label:has(> span:text-matches("^Tipologia")) select').selectOption('Catalogo generale');
    await d.click('button:has-text("Salva documento")');
    await d.waitForSelector('.document:has-text("Catalogo B&B Italia 2026")');
  }
  await shot(d, 'desktop-06-cataloghi'); log('catalogo PDF caricato e collegato');
  // collega lo stesso catalogo a "Le Bambole"
  await d.click('.back'); await d.click('.productCard:has-text("Le Bambole")'); await d.click('.tabs button:has-text("Cataloghi")');
  if (!(await d.locator('.document:has-text("Catalogo B&B Italia")').count())) {
    await d.locator('.taskAdd select').selectOption({ label: 'Catalogo B&B Italia 2026 · Catalogo generale' });
    await d.click('button[title="Collega"]'); await d.waitForSelector('.document:has-text("Collegato anche a")');
  }
  log('catalogo collegato a un secondo prodotto');
  // aggiungi al preventivo
  await d.click('.tabs button:has-text("Materiali")'); await d.click('.chips button:has-text("Pelle")');
  await d.click('button:has-text("Aggiungi al preventivo")'); await d.waitForSelector('.pageHeading h1:has-text("La proposta.")');
  await nav(d, 'Prodotti'); await d.click('.productCard:has-text("Camaleonda")');
  await d.click('button:has-text("Aggiungi al preventivo")'); await d.waitForSelector('.quoteItem:has-text("Camaleonda")');
  log('2 prodotti nel preventivo');

  // cliente
  await nav(d, 'Clienti');
  if (!(await d.locator('.clientCard:has-text("Famiglia Rossi")').count())) {
    const f = d.locator('.twoCols .panel').first();
    await f.locator('label:has(> span:text-matches("^Nome e cognome")) input').fill('Famiglia Rossi');
    await f.locator('label:has(> span:text-matches("^Email")) input').fill('rossi@example.com');
    await f.locator('label:has(> span:text-matches("^Telefono")) input').fill('+41 91 000 00 00');
    await f.locator('textarea').fill('Villa a Lugano — living e dining, preferenza tessuti chiari.');
    await d.click('button:has-text("Salva cliente")'); await d.waitForSelector('.clientCard.active:has-text("Famiglia Rossi")');
  }
  await shot(d, 'desktop-07-clienti'); log('cliente salvato');

  // preventivo + email con allegati
  await nav(d, 'Preventivi'); await d.waitForSelector('.quoteItem');
  await d.locator('label:has(> span:text-matches("^Cliente")) select').first().selectOption({ label: 'Famiglia Rossi' });
  await d.waitForTimeout(300); await shot(d, 'desktop-08-preventivo');
  await d.click('button:has-text("Prepara email")'); await d.waitForSelector('.modal');
  await d.waitForTimeout(300); await shot(d, 'desktop-09-email');
  await d.click('.modal button:has-text("Invia email")'); await d.waitForSelector('.sentBox', { timeout: 15000 });
  const sentText = await d.locator('.sentBox').innerText(); log('invio:', sentText.replace(/\n+/g, ' | '));
  const demo = process.env.E2E_DEMO === '1';
  if (!(demo ? /Registrata ma non consegnata/ : /Inviata a rossi@example.com/).test(sentText)) errors.push('email preventivo non inviata: ' + sentText);
  await shot(d, 'desktop-10-email-inviata');
  await d.click('.modal button:has-text("Chiudi")'); await d.waitForSelector('.quoteItem:has-text("PD-")');
  await shot(d, 'desktop-11-storico');

  // agenda
  await nav(d, 'Agenda'); await d.click('.segmented button:has-text("Prenota")');
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  await d.locator('label:has(> span:text-matches("^Nome cliente")) input').fill('Famiglia Rossi');
  await d.locator('label:has(> span:text-matches("^Showroom")) select').selectOption('Lugano');
  await d.locator('label:has(> span:text-matches("^Data")) input').fill(date);
  await d.locator('label:has(> span:text-matches("^Tipologia")) select').selectOption('Presentazione preventivo');
  await d.click('button:has-text("Salva appuntamento")'); await d.waitForSelector('.appointment:has-text("Famiglia Rossi")');
  await d.locator('.appointment:has-text("Famiglia Rossi") button:has-text("Invia conferma")').first().click();
  await d.waitForSelector(process.env.E2E_DEMO === '1' ? '.toast' : '.toast:has-text("Conferma")'); await shot(d, 'desktop-12-agenda'); log('appuntamento + conferma .ics inviata');
  await d.click('.segmented button:has-text("Link cliente")'); await shot(d, 'desktop-13-link-prenotazione');

  // attività e AI
  await nav(d, 'Attività'); await d.fill('.taskAdd input', 'Richiamare Famiglia Rossi per feedback proposta');
  await d.locator('.taskAdd select').selectOption({ label: 'Giulia Consulente' });
  await d.click('.taskAdd .btn'); await d.waitForSelector('.task:has-text("Richiamare")'); await shot(d, 'desktop-14-attivita');
  await nav(d, 'Ask myshowroom'); await d.click('.suggestions button:has-text("Prodotti Maxalto")'); await d.waitForSelector('.aiAnswer');
  await shot(d, 'desktop-15-assistente'); log('assistente:', await d.locator('.aiAnswer').innerText());

  // ───── Pagina pubblica di prenotazione ─────
  const pub = await newPage(browser, 'public', devices['iPhone 15 Pro']);
  await pub.goto(base + (process.env.E2E_DEMO === '1' ? '/#/book/lugano' : '/book/lugano')); await pub.waitForSelector('.chips button');
  await pub.locator('label:has(> span:text-matches("^Nome e cognome")) input').fill('Anna Bianchi');
  await pub.locator('label:has(> span:text-matches("^Email")) input').fill('anna@example.com');
  await pub.click('.chips button >> nth=0');
  await shot(pub, 'iphone-20-prenotazione-pubblica');
  await pub.click('button:has-text("Prenota la visita")'); await pub.waitForSelector('text=Visita confermata');
  await shot(pub, 'iphone-21-prenotazione-confermata'); log('prenotazione pubblica confermata');

  // ───── iPad e iPhone: consulente ─────
  for (const [name, dev] of [['ipad', devices['iPad Pro 11']], ['iphone', devices['iPhone 15 Pro']]]) {
    const p = await newPage(browser, name, dev);
    await p.goto(base); await p.waitForSelector('.authPanel'); await shot(p, `${name}-01-login`);
    await login(p, 'giulia@peverelli.demo', 'myshowroom-demo'); await shot(p, `${name}-02-home`);
    await nav(p, 'Prodotti'); await p.waitForSelector('.productCard'); await shot(p, `${name}-03-prodotti`);
    await p.click('.productCard:has-text("Le Bambole")'); await p.waitForSelector('.productSummary'); await shot(p, `${name}-04-scheda`);
    await p.click('.tabs button:has-text("Cataloghi")'); await p.waitForSelector(DEMO ? '.docLayout' : '.document'); if (!DEMO) await p.locator('.document').first().scrollIntoViewIfNeeded(); await shot(p, `${name}-05-cataloghi`);
    if (await p.locator('.mobileMenu').isVisible()) { await p.click('.mobileMenu'); await p.waitForTimeout(300); await shot(p, `${name}-06-menu`); await p.click('.sidebar .navItem:has-text("Preventivi")'); }
    else await p.click('.sidebar .navItem:has-text("Preventivi")');
    await p.waitForSelector('.pageHeading h1:has-text("La proposta.")'); await p.waitForTimeout(300); await shot(p, `${name}-07-preventivi`);
    await nav(p, 'Agenda'); await p.waitForSelector(DEMO ? '.modeTabs' : '.appointment'); await shot(p, `${name}-08-agenda`);
    // il consulente non vede Team
    if (await p.locator('.navItem:has-text("Team")').count()) errors.push(`[${name}] consulente vede la sezione Team`);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(`[${name}] scroll orizzontale presente`);
  }
  await browser.close();
  console.log(errors.length ? '\nERRORI:\n' + errors.join('\n') : '\nNessun errore JavaScript; tutti i flussi completati.');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(errors.join('\n')); process.exit(1); });
