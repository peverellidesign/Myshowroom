import "server-only";
import type { Currency, Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { toNum } from "./format";
import { convert, getExchangeRate } from "./settings";
import { AppError } from "./errors";
import type { SessionUser } from "./auth";

type Num = Prisma.Decimal | number | string;

export function lineTotal(i: { unitPrice: Num; quantity: number; discountPct: Num }) {
  return toNum(i.unitPrice) * i.quantity * (1 - toNum(i.discountPct) / 100);
}

export function quotationTotals(q: {
  items: { unitPrice: Num; quantity: number; discountPct: Num }[];
  discountPct: Num;
  transportCost: Num;
  installationCost: Num;
  vatPct: Num;
}) {
  const subtotal = q.items.reduce((s, i) => s + lineTotal(i), 0);
  const discount = subtotal * (toNum(q.discountPct) / 100);
  const services = toNum(q.transportCost) + toNum(q.installationCost);
  const taxable = subtotal - discount + services;
  const vat = taxable * (toNum(q.vatPct) / 100);
  return { subtotal, discount, services, taxable, vat, total: taxable + vat };
}

export async function nextQuotationNumber(tx: Tx | typeof db = db) {
  const year = new Date().getFullYear();
  const prefix = `PD-${year}-`;
  const last = await tx.quotation.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length).split("-")[0]) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/** Returns the user's active draft quotation, creating one if needed. */
export async function ensureActiveQuotation(user: SessionUser) {
  if (user.activeQuotationId) {
    const q = await db.quotation.findFirst({ where: { id: user.activeQuotationId, status: { in: ["BOZZA", "IN_TRATTATIVA"] } } });
    if (q) return q;
  }
  const rate = await getExchangeRate();
  const q = await db.quotation.create({
    data: {
      number: await nextQuotationNumber(),
      createdById: user.id,
      currency: "CHF",
      exchangeRate: rate.eurToChf,
      exchangeSource: rate.source,
      validUntil: new Date(Date.now() + 30 * 86400_000),
    },
  });
  await db.user.update({ where: { id: user.id }, data: { activeQuotationId: q.id } });
  return q;
}

/** Builds a quotation line from a product, optionally a configuration or a physical inventory item. */
export async function buildItem(
  input: { productModelId: string; configurationId?: string | null; inventoryItemId?: string | null; quantity?: number },
  target: Currency,
) {
  const product = await db.productModel.findUnique({ where: { id: input.productModelId }, include: { brand: true } });
  if (!product) throw new AppError("Prodotto non trovato.");
  const rate = await getExchangeRate();
  let price = product.listPrice ? toNum(product.listPrice) : 0;
  let currency: Currency = product.currency;
  let description: string | null = null;
  let configLabel: string | null = null;
  let materials: string | null = null;
  let dimensions = product.dimensions;
  let discountPct = 0;
  let configurationId = input.configurationId ?? null;

  if (input.inventoryItemId) {
    const item = await db.inventoryItem.findUnique({ where: { id: input.inventoryItemId }, include: { location: true, configuration: true } });
    if (!item || item.productModelId !== product.id) throw new AppError("Pezzo non valido.");
    if (item.price) {
      price = toNum(item.price);
      currency = item.currency;
    }
    discountPct = toNum(item.discountPct);
    description = item.status === "ESPOSTO" ? `Pezzo esposto · ${item.location.name}` : `Esemplare in stock · ${item.location.name}`;
    configLabel = item.composition ?? item.configuration?.name ?? null;
    configurationId = item.configurationId;
    materials = item.materialsDescription;
    dimensions = item.dimensions ?? item.configuration?.dimensions ?? dimensions;
  } else if (configurationId) {
    const conf = await db.productConfiguration.findUnique({ where: { id: configurationId } });
    if (!conf || conf.productModelId !== product.id) throw new AppError("Composizione non valida.");
    configLabel = conf.name;
    dimensions = conf.dimensions ?? dimensions;
    if (conf.price) {
      price = toNum(conf.price);
      currency = conf.currency;
    }
    description = "Su ordinazione dal produttore";
  } else {
    description = "Su ordinazione dal produttore";
  }

  return {
    productModelId: product.id,
    configurationId,
    inventoryItemId: input.inventoryItemId ?? null,
    brandName: product.brand.name,
    modelName: product.name,
    description,
    configLabel,
    materials,
    dimensions,
    quantity: input.quantity ?? 1,
    unitPrice: Math.round(convert(price, currency, target, rate) * 100) / 100,
    discountPct,
  };
}
