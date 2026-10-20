import "server-only";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { db } from "../db";
import { getFile } from "../storage";
import { fmtDate, money, pct, toNum } from "../format";
import { lineTotal, quotationTotals } from "../quotations";
import { AppError } from "../errors";

const INK = "#171717";
const SOFT = "#777773";
const LINE = "#E8E8E4";

async function thumb(key: string | undefined) {
  if (!key) return null;
  try {
    const raw = await getFile(key);
    return await sharp(raw, { density: 144 }).resize(360, 270, { fit: "contain", background: "#F7F7F5" }).flatten({ background: "#F7F7F5" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/** Server-side branded PDF for a quotation. */
export async function renderQuotationPdf(quotationId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const q = await db.quotation.findUnique({
    where: { id: quotationId },
    include: {
      client: { include: { preferredLocation: true } },
      createdBy: true,
      items: { orderBy: { sortOrder: "asc" }, include: { productModel: { include: { images: { orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }], take: 1 } } } } },
    },
  });
  if (!q) throw new AppError("Preventivo non trovato.", 404);
  const totals = quotationTotals(q);
  const images = await Promise.all(q.items.map((i) => thumb(i.productModel?.images[0]?.storageKey)));

  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 52, right: 52 }, info: { Title: `Preventivo ${q.number}`, Author: "Peverelli Design" }, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;

  // Header
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text("PEVERELLI", L, 56, { continued: true, characterSpacing: 0.5 }).font("Helvetica").text(" DESIGN");
  doc.font("Helvetica").fontSize(7.5).fillColor(SOFT).text("M Y S H O W R O O M", L, 76);
  doc.fontSize(8).fillColor(SOFT).text("Como · Lugano · Milano · Dubai", L, 56, { width: W, align: "right" });
  doc.moveTo(L, 98).lineTo(R, 98).strokeColor(LINE).lineWidth(0.8).stroke();

  // Title block
  doc.fontSize(8).fillColor(SOFT).text("PREVENTIVO", L, 122, { characterSpacing: 1.2 });
  doc.font("Helvetica").fontSize(24).fillColor(INK).text(q.title ?? "La proposta.", L, 136, { width: W * 0.6 });
  const metaY = 122;
  const meta: [string, string][] = [
    ["Numero", q.number],
    ["Data", fmtDate(q.updatedAt, { month: "long" })],
    ["Valido fino al", q.validUntil ? fmtDate(q.validUntil, { month: "long" }) : "—"],
    ["Consulente", q.createdBy.name],
  ];
  meta.forEach(([k, v], idx) => {
    doc.fontSize(7.5).fillColor(SOFT).text(k.toUpperCase(), L + W * 0.64, metaY + idx * 22, { width: W * 0.36, characterSpacing: 0.8 });
    doc.fontSize(9.5).fillColor(INK).text(v, L + W * 0.64, metaY + idx * 22 + 9, { width: W * 0.36 });
  });

  let y = 222;
  doc.fontSize(7.5).fillColor(SOFT).text("CLIENTE", L, y, { characterSpacing: 1 });
  y += 12;
  doc.fontSize(11).fillColor(INK).text(q.client?.name ?? "—", L, y);
  y += 15;
  const clientLines = [q.client?.company, q.client?.email, q.client?.phone, q.client?.city].filter(Boolean).join("  ·  ");
  if (clientLines) {
    doc.fontSize(9).fillColor(SOFT).text(clientLines, L, y, { width: W });
    y += 14;
  }
  y += 18;

  // Items
  const imgW = 92;
  const imgH = 69;
  const colText = L + imgW + 16;
  const colPrice = R - 110;
  doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
  y += 14;

  const ensureSpace = (h: number) => {
    if (y + h > doc.page.height - doc.page.margins.bottom - 10) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  };

  q.items.forEach((item, idx) => {
    ensureSpace(imgH + 24);
    const top = y;
    const img = images[idx];
    if (img) doc.image(img, L, top, { fit: [imgW, imgH], align: "center", valign: "center" });
    else doc.rect(L, top, imgW, imgH).fillColor("#F4F3F0").fill();

    doc.fontSize(7.5).fillColor(SOFT).text(item.brandName.toUpperCase(), colText, top, { width: colPrice - colText - 10, characterSpacing: 0.8 });
    doc.fontSize(12).fillColor(INK).text(item.modelName, colText, top + 11, { width: colPrice - colText - 10 });
    let ty = doc.y + 3;
    const details = [
      item.configLabel && `Composizione: ${item.configLabel}`,
      item.materials && `Materiali e finiture: ${item.materials}`,
      item.dimensions && `Dimensioni: ${item.dimensions}`,
      item.description,
    ].filter(Boolean) as string[];
    doc.fontSize(8.5).fillColor(SOFT);
    for (const d of details) {
      doc.text(d, colText, ty, { width: colPrice - colText - 10 });
      ty = doc.y + 1.5;
    }

    doc.fontSize(8.5).fillColor(SOFT).text(`${item.quantity} × ${money(item.unitPrice, q.currency, 0)}`, colPrice, top + 11, { width: R - colPrice, align: "right" });
    if (toNum(item.discountPct) > 0) doc.text(`Sconto ${pct(item.discountPct)}`, colPrice, doc.y + 1, { width: R - colPrice, align: "right" });
    doc.fontSize(11).fillColor(INK).text(money(lineTotal(item), q.currency, 0), colPrice, doc.y + 3, { width: R - colPrice, align: "right" });

    y = Math.max(top + imgH, ty, doc.y) + 14;
    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
    y += 14;
  });

  // Totals
  ensureSpace(150);
  const tl = L + W * 0.5;
  const row = (label: string, value: string, strong = false) => {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 12 : 9.5).fillColor(strong ? INK : SOFT).text(label, tl, y, { width: W * 0.3 });
    doc.fillColor(INK).text(value, tl + W * 0.2, y, { width: W * 0.3, align: "right" });
    y += strong ? 20 : 15;
  };
  row("Subtotale", money(totals.subtotal, q.currency, 0));
  if (totals.discount > 0) row(`Sconto ${pct(q.discountPct)}`, `− ${money(totals.discount, q.currency, 0)}`);
  if (toNum(q.transportCost) > 0) row("Trasporto", money(q.transportCost, q.currency, 0));
  if (toNum(q.installationCost) > 0) row("Montaggio", money(q.installationCost, q.currency, 0));
  if (totals.vat > 0) row(`IVA ${toNum(q.vatPct)}%`, money(totals.vat, q.currency, 0));
  y += 4;
  doc.moveTo(tl, y).lineTo(R, y).strokeColor(INK).lineWidth(0.8).stroke();
  y += 10;
  row("Totale indicativo", money(totals.total, q.currency, 0), true);
  doc.font("Helvetica");

  if (q.notes) {
    y += 18;
    ensureSpace(80);
    doc.fontSize(7.5).fillColor(SOFT).text("NOTE COMMERCIALI", L, y, { characterSpacing: 1 });
    doc.fontSize(9.5).fillColor(INK).text(q.notes, L, y + 13, { width: W });
    y = doc.y;
  }
  y += 20;
  ensureSpace(40);
  doc.fontSize(7.5).fillColor(SOFT).text(
    `Prezzi in ${q.currency}. ${q.exchangeRate ? `Eventuali conversioni al cambio 1 EUR = ${toNum(q.exchangeRate).toFixed(4)} CHF (${q.exchangeSource === "BCE" ? "riferimento BCE" : "cambio configurato"}). ` : ""}Disponibilità dei pezzi in stock soggetta a conferma. Le composizioni su ordinazione seguono i tempi del produttore.`,
    L,
    y,
    { width: W },
  );

  // Footer on every page (bottom margin lifted so the footer never triggers a page break)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    doc.fontSize(7).fillColor(SOFT).text("Peverelli Design · myshowroom — Your showroom. Everywhere.", L, fy, { width: W / 2, lineBreak: false });
    doc.text(`${q.number} · ${i + 1}/${range.count}`, L + W / 2, fy, { width: W / 2, align: "right", lineBreak: false });
  }

  doc.end();
  return { buffer: await done, fileName: `Preventivo-${q.number}.pdf` };
}
