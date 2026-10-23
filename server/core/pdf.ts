// Generazione PDF del preventivo con pdf-lib (puro JavaScript: Node e browser).
import { PDFDocument, StandardFonts, rgb, setCharacterSpacing, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { convert, formatMoney, type Client, type Quote, type User } from '../../shared/types';

const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.53, 0.53, 0.51);
const LINE = rgb(0.91, 0.91, 0.89);
const W = 595.28, H = 841.89, M = 48;

export type QuotePdfInput = {
  quote: Quote; client: Client | null; author: User;
  images: Record<string, { data: Uint8Array; mime: string } | null>; // per productId
  sites: string;
  date: Date;
};

function sanitize(font: PDFFont, s: string) {
  let out = '';
  for (const ch of String(s ?? '')) {
    try { font.encodeText(ch); out += ch; } catch { out += ch === ' ' || ch === ' ' ? ' ' : '?'; }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/).map(l => sanitize(font, l))) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(t, size) > maxW && line) { lines.push(line); line = word; } else line = t;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderQuotePdf(input: QuotePdfInput): Promise<Uint8Array> {
  const { quote, client, author } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`Proposta ${quote.number ?? ''} — Peverelli Design`);
  doc.setAuthor('Peverelli Design');
  doc.setCreator('myshowroom by Peverelli Design');
  doc.setProducer('myshowroom');
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const imgs: Record<string, PDFImage> = {};
  for (const [pid, im] of Object.entries(input.images)) {
    if (!im) continue;
    try { imgs[pid] = im.mime.includes('png') ? await doc.embedPng(im.data) : await doc.embedJpg(im.data); } catch { /* immagine non supportata: si omette */ }
  }

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; spacing?: number; align?: 'right' } = {}) => {
    const f = opts.font ?? reg; const t = sanitize(f, s);
    let xx = x;
    if (opts.align === 'right') xx = x - f.widthOfTextAtSize(t, size) - (opts.spacing ?? 0) * Math.max(0, t.length - 1);
    if (opts.spacing) p.pushOperators(setCharacterSpacing(opts.spacing));
    p.drawText(t, { x: xx, y: yy, size, font: f, color: opts.color ?? INK });
    if (opts.spacing) p.pushOperators(setCharacterSpacing(0));
  };
  const footer = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.5, color: LINE });
    text(p, '© PEVERELLI DESIGN · ' + input.sites.toUpperCase(), M, 30, 7, { color: MUTED, spacing: 0.8 });
    text(p, String(n), W - M, 30, 7, { color: MUTED, align: 'right' });
  };
  const newPage = () => { footer(page, doc.getPageCount()); page = doc.addPage([W, H]); y = H - M; };
  const ensure = (h: number) => { if (y - h < 70) newPage(); };

  // Intestazione — wordmark come nell'app
  text(page, 'myshowroom', M, y - 18, 22, { spacing: -0.6 });
  text(page, 'by Peverelli Design', M, y - 32, 8.5, { color: MUTED });
  text(page, 'PROPOSTA', W - M, y - 12, 7.5, { color: MUTED, spacing: 1.3, align: 'right' });
  text(page, quote.number ?? 'BOZZA', W - M, y - 28, 13, { align: 'right' });
  y -= 60;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  y -= 28;

  const col = (label: string, value: string[], x: number) => {
    text(page, label, x, y, 7, { color: MUTED, spacing: 1.3 });
    value.forEach((v, i) => text(page, v, x, y - 16 - i * 13, 10));
  };
  col('CLIENTE', [client?.name || 'Cliente', client?.email || '', client?.phone || ''].filter(Boolean), M);
  col('DATA', [input.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })], M + 210);
  col('CONSULENTE', [author.name, author.email], M + 340);
  y -= 70;

  if (quote.body.trim()) {
    const lines = wrap(reg, quote.body, 10, W - 2 * M);
    for (const l of lines) { ensure(14); text(page, l, M, y, 10, { color: rgb(0.27, 0.27, 0.26) }); y -= 14; }
    y -= 16;
  }

  ensure(40);
  text(page, 'PRODOTTI SELEZIONATI', M, y, 7, { color: MUTED, spacing: 1.3 });
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });

  quote.items.forEach((it, idx) => {
    const img = imgs[it.productId];
    const rowH = img ? 86 : 74;
    ensure(rowH + 4);
    const top = y - 14;
    let x = M;
    if (img) {
      // immagine contenuta in un riquadro 4:3 come le card dell'app
      const s = Math.min(84 / img.width, 63 / img.height);
      const w = img.width * s, h = img.height * s;
      page.drawRectangle({ x, y: top - 63, width: 84, height: 63, color: rgb(0.945, 0.945, 0.933) });
      page.drawImage(img, { x: x + (84 - w) / 2, y: top - 63 + (63 - h) / 2, width: w, height: h });
      x += 100;
    }
    text(page, `${idx + 1}. ${it.brand.toUpperCase()}`, x, top - 8, 7, { color: MUTED, spacing: 1 });
    text(page, it.productName, x, top - 23, 12);
    text(page, `${it.config} · ${it.dims}`, x, top - 37, 8.5, { color: MUTED });
    text(page, `${it.material} / ${it.color}`, x, top - 49, 8.5, { color: MUTED });
    if (quote.showPrices) text(page, formatMoney(convert(it.price, it.currency, quote.currency, quote.rate), quote.currency), W - M, top - 23, 11, { align: 'right' });
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
  });

  if (quote.showPrices) {
    ensure(70);
    y -= 30;
    text(page, 'Totale indicativo', M, y, 10, { color: MUTED });
    text(page, formatMoney(quote.total, quote.currency), W - M, y - 2, 20, { align: 'right' });
    y -= 22;
    const otherCur = quote.items.some(i => i.currency !== quote.currency);
    if (otherCur) { text(page, `Importi convertiti al cambio indicativo 1 CHF = ${quote.rate} EUR.`, M, y, 7.5, { color: MUTED }); y -= 12; }
  }

  ensure(60);
  y -= 24;
  for (const l of wrap(reg, 'Prezzi, disponibilità, composizioni e finiture sono indicativi e soggetti a conferma scritta da parte di Peverelli Design. La presente proposta non costituisce conferma d’ordine.', 7.5, W - 2 * M)) {
    text(page, l, M, y, 7.5, { color: MUTED }); y -= 11;
  }
  footer(page, doc.getPageCount());
  return doc.save();
}
