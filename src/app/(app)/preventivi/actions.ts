"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Currency, QuotationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { toNum } from "@/lib/format";
import { buildItem, ensureActiveQuotation, nextQuotationNumber } from "@/lib/quotations";
import { convert, getExchangeRate } from "@/lib/settings";
import { optStr, str } from "@/lib/utils";

const num = (v: string, fallback = 0) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

async function editable(id: string) {
  const q = await db.quotation.findUnique({ where: { id } });
  if (!q) throw new AppError("Preventivo non trovato.", 404);
  if (q.status === "ACCETTATO" || q.status === "RIFIUTATO") {
    throw new AppError("Il preventivo è chiuso. Crea una revisione per modificarlo.");
  }
  return q;
}

/** "Aggiungi al preventivo" from product pages, inventory and AI results. */
export async function addToQuotation(input: { productModelId: string; configurationId?: string | null; inventoryItemId?: string | null; quotationId?: string | null; quantity?: number }) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const q = input.quotationId ? await editable(input.quotationId) : await ensureActiveQuotation(user);
    const item = await buildItem(input, q.currency);
    const count = await db.quotationItem.count({ where: { quotationId: q.id } });
    await db.quotationItem.create({ data: { ...item, quotationId: q.id, sortOrder: count } });
    if (input.quotationId) await db.user.update({ where: { id: user.id }, data: { activeQuotationId: q.id } });
    await audit(user.id, "quotation.item.add", "Quotation", q.id, `Aggiunto ${item.brandName} ${item.modelName} a ${q.number}`);
    revalidatePath("/", "layout");
    return { quotationId: q.id, number: q.number };
  }, "Aggiunto al preventivo.");
}

export async function createQuotation(form: FormData) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const rate = await getExchangeRate();
    const q = await db.quotation.create({
      data: {
        number: await nextQuotationNumber(),
        title: optStr(form, "title"),
        clientId: optStr(form, "clientId"),
        visitId: optStr(form, "visitId"),
        currency: (str(form, "currency") || "CHF") as Currency,
        exchangeRate: rate.eurToChf,
        exchangeSource: rate.source,
        createdById: user.id,
        validUntil: new Date(Date.now() + 30 * 86400_000),
      },
    });
    // Visit → quotation: pre-fill with the products viewed during the visit.
    if (q.visitId) {
      const visit = await db.showroomVisit.findUnique({ where: { id: q.visitId }, include: { products: true } });
      let order = 0;
      for (const vp of visit?.products ?? []) {
        const item = await buildItem({ productModelId: vp.productModelId }, q.currency);
        await db.quotationItem.create({ data: { ...item, quotationId: q.id, sortOrder: order++ } });
      }
    }
    await db.user.update({ where: { id: user.id }, data: { activeQuotationId: q.id } });
    await audit(user.id, "quotation.create", "Quotation", q.id, `Creato preventivo ${q.number}`);
    revalidatePath("/preventivi");
    return { id: q.id };
  }, "Preventivo creato.");
}

const headerSchema = z.object({
  title: z.string().nullable(),
  clientId: z.string().nullable(),
  discountPct: z.number().min(0).max(100, "Sconto massimo 100%."),
  transportCost: z.number().min(0),
  installationCost: z.number().min(0),
  vatPct: z.number().min(0).max(100),
  notes: z.string().nullable(),
  validUntil: z.date().nullable(),
});

export async function updateQuotation(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    await editable(id);
    const valid = str(form, "validUntil");
    const data = headerSchema.parse({
      title: optStr(form, "title"),
      clientId: optStr(form, "clientId"),
      discountPct: num(str(form, "discountPct")),
      transportCost: num(str(form, "transportCost")),
      installationCost: num(str(form, "installationCost")),
      vatPct: num(str(form, "vatPct")),
      notes: optStr(form, "notes"),
      validUntil: valid ? new Date(valid) : null,
    });
    await db.quotation.update({ where: { id }, data });
    await audit(user.id, "quotation.update", "Quotation", id, "Aggiornati dati preventivo");
    revalidatePath(`/preventivi/${id}`);
  }, "Preventivo salvato.");
}

export async function setQuotationClient(id: string, clientId: string | null) {
  return run(async () => {
    await assertUser("quote:edit");
    await editable(id);
    await db.quotation.update({ where: { id }, data: { clientId } });
    revalidatePath(`/preventivi/${id}`);
  });
}

/** Switches currency, converting every line with the current configured exchange rate. */
export async function setQuotationCurrency(id: string, currency: Currency) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const q = await editable(id);
    if (q.currency === currency) return;
    const rate = await getExchangeRate();
    const items = await db.quotationItem.findMany({ where: { quotationId: id } });
    const conv = (v: unknown) => Math.round(convert(toNum(v as number), q.currency, currency, rate) * 100) / 100;
    await db.$transaction([
      ...items.map((i) => db.quotationItem.update({ where: { id: i.id }, data: { unitPrice: conv(i.unitPrice) } })),
      db.quotation.update({
        where: { id },
        data: {
          currency,
          exchangeRate: rate.eurToChf,
          exchangeSource: rate.source,
          transportCost: conv(q.transportCost),
          installationCost: conv(q.installationCost),
        },
      }),
    ]);
    await audit(user.id, "quotation.currency", "Quotation", id, `Valuta ${q.currency} → ${currency} (1 EUR = ${rate.eurToChf} CHF, ${rate.source})`);
    revalidatePath(`/preventivi/${id}`);
  }, "Valuta aggiornata.");
}

export async function addCustomItem(quotationId: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    await editable(quotationId);
    const productModelId = optStr(form, "productModelId");
    const count = await db.quotationItem.count({ where: { quotationId } });
    const q = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    if (productModelId) {
      const item = await buildItem(
        { productModelId, configurationId: optStr(form, "configurationId"), inventoryItemId: optStr(form, "inventoryItemId"), quantity: Math.max(1, num(str(form, "quantity"), 1)) },
        q.currency,
      );
      await db.quotationItem.create({ data: { ...item, quotationId, sortOrder: count } });
    } else {
      const modelName = str(form, "modelName");
      if (!modelName) throw new AppError("Seleziona un prodotto o inserisci una descrizione.");
      await db.quotationItem.create({
        data: {
          quotationId,
          brandName: str(form, "brandName") || "—",
          modelName,
          description: optStr(form, "description"),
          quantity: Math.max(1, num(str(form, "quantity"), 1)),
          unitPrice: num(str(form, "unitPrice")),
          sortOrder: count,
        },
      });
    }
    await audit(user.id, "quotation.item.add", "Quotation", quotationId, "Aggiunta riga");
    revalidatePath(`/preventivi/${quotationId}`);
    revalidatePath("/", "layout");
  }, "Riga aggiunta.");
}

const itemSchema = z.object({
  quantity: z.number().int().min(1, "Quantità minima 1."),
  unitPrice: z.number().min(0, "Prezzo non valido."),
  discountPct: z.number().min(0).max(100, "Sconto massimo 100%."),
  description: z.string().nullable(),
  configLabel: z.string().nullable(),
  materials: z.string().nullable(),
  dimensions: z.string().nullable(),
});

export async function updateItem(itemId: string, form: FormData) {
  return run(async () => {
    await assertUser("quote:edit");
    const item = await db.quotationItem.findUniqueOrThrow({ where: { id: itemId } });
    await editable(item.quotationId);
    const data = itemSchema.parse({
      quantity: num(str(form, "quantity"), 1),
      unitPrice: num(str(form, "unitPrice")),
      discountPct: num(str(form, "discountPct")),
      description: optStr(form, "description"),
      configLabel: optStr(form, "configLabel"),
      materials: optStr(form, "materials"),
      dimensions: optStr(form, "dimensions"),
    });
    await db.quotationItem.update({ where: { id: itemId }, data });
    revalidatePath(`/preventivi/${item.quotationId}`);
  }, "Riga aggiornata.");
}

export async function removeItem(itemId: string) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const item = await db.quotationItem.findUniqueOrThrow({ where: { id: itemId } });
    await editable(item.quotationId);
    await db.quotationItem.delete({ where: { id: itemId } });
    await audit(user.id, "quotation.item.remove", "Quotation", item.quotationId, `Rimosso ${item.modelName}`);
    revalidatePath(`/preventivi/${item.quotationId}`);
    revalidatePath("/", "layout");
  }, "Riga rimossa.");
}

export async function setQuotationStatus(id: string, status: QuotationStatus) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const q = await db.quotation.update({ where: { id }, data: { status } });
    await audit(user.id, "quotation.status", "Quotation", id, `${q.number}: stato ${status}`);
    revalidatePath(`/preventivi/${id}`);
    revalidatePath("/preventivi");
  }, "Stato aggiornato.");
}

export async function setActiveQuotation(id: string) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    await editable(id);
    await db.user.update({ where: { id: user.id }, data: { activeQuotationId: id } });
    revalidatePath("/", "layout");
  }, "Preventivo attivo: i prodotti verranno aggiunti qui.");
}

async function copyQuotation(id: string, userId: string, asRevision: boolean) {
  const src = await db.quotation.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!src) throw new AppError("Preventivo non trovato.", 404);
  return db.$transaction(async (tx) => {
    let number: string;
    let revision = 0;
    let parentId: string | null = null;
    if (asRevision) {
      const rootId = src.parentId ?? src.id;
      const root = await tx.quotation.findUniqueOrThrow({ where: { id: rootId } });
      const maxRev = await tx.quotation.aggregate({ where: { OR: [{ id: rootId }, { parentId: rootId }] }, _max: { revision: true } });
      revision = (maxRev._max.revision ?? 0) + 1;
      number = `${root.number}-R${revision}`;
      parentId = rootId;
    } else {
      number = await nextQuotationNumber(tx);
    }
    const copy = await tx.quotation.create({
      data: {
        number,
        revision,
        parentId,
        title: src.title,
        clientId: src.clientId,
        visitId: src.visitId,
        currency: src.currency,
        exchangeRate: src.exchangeRate,
        exchangeSource: src.exchangeSource,
        discountPct: src.discountPct,
        transportCost: src.transportCost,
        installationCost: src.installationCost,
        vatPct: src.vatPct,
        notes: src.notes,
        validUntil: new Date(Date.now() + 30 * 86400_000),
        createdById: userId,
        items: {
          create: src.items.map(({ id: _id, quotationId: _q, ...rest }) => rest),
        },
      },
    });
    await tx.user.update({ where: { id: userId }, data: { activeQuotationId: copy.id } });
    await audit(userId, asRevision ? "quotation.revision" : "quotation.duplicate", "Quotation", copy.id, `${asRevision ? "Revisione" : "Copia"} di ${src.number} → ${copy.number}`, undefined, tx);
    return copy;
  });
}

export async function duplicateQuotation(id: string) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const copy = await copyQuotation(id, user.id, false);
    revalidatePath("/preventivi");
    return { id: copy.id };
  }, "Preventivo duplicato.");
}

export async function reviseQuotation(id: string) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const copy = await copyQuotation(id, user.id, true);
    revalidatePath("/preventivi");
    return { id: copy.id };
  }, "Revisione creata.");
}

export async function deleteQuotation(id: string) {
  return run(async () => {
    const user = await assertUser("quote:edit");
    const q = await db.quotation.findUniqueOrThrow({ where: { id } });
    if (q.status !== "BOZZA") throw new AppError("Si possono eliminare solo le bozze.");
    await db.quotation.delete({ where: { id } });
    await audit(user.id, "quotation.delete", "Quotation", id, `Eliminato ${q.number}`);
    revalidatePath("/preventivi");
  }, "Bozza eliminata.");
}
