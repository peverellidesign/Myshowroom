"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { InventoryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { INVENTORY_STATUS_LABELS } from "@/lib/format";
import { releaseReservation, reserveItem, syncReservedStatus } from "@/lib/inventory";
import { deleteFile, storeImage } from "@/lib/storage";
import { optStr, str } from "@/lib/utils";

function refresh(itemId?: string, productId?: string) {
  revalidatePath("/stock");
  revalidatePath("/");
  if (itemId) revalidatePath(`/stock/${itemId}`);
  if (productId) revalidatePath(`/prodotti/${productId}`);
}

export async function reserve(form: FormData) {
  return run(async () => {
    const user = await assertUser("inventory:reserve");
    const expires = str(form, "expiresAt");
    if (!expires) throw new AppError("Indica la data di scadenza.");
    const inventoryItemId = str(form, "inventoryItemId");
    const clientId = str(form, "clientId");
    if (!inventoryItemId) throw new AppError("Seleziona il pezzo da riservare.");
    if (!clientId) throw new AppError("Seleziona il cliente.");
    const r = await reserveItem({
      inventoryItemId,
      clientId,
      quantity: Math.max(1, Number(str(form, "quantity") || 1)),
      expiresAt: new Date(`${expires}T23:59:59`),
      notes: optStr(form, "notes"),
      userId: user.id,
    });
    const item = await db.inventoryItem.findUnique({ where: { id: r.inventoryItemId } });
    refresh(r.inventoryItemId, item?.productModelId);
    revalidatePath(`/clienti/${clientId}`);
  }, "Prodotto riservato.");
}

export async function release(reservationId: string) {
  return run(async () => {
    const user = await assertUser("inventory:reserve");
    const r = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { inventoryItem: true } });
    await releaseReservation(reservationId, user.id);
    refresh(r.inventoryItemId, r.inventoryItem.productModelId);
    revalidatePath(`/clienti/${r.clientId}`);
  }, "Prenotazione rilasciata.");
}

export async function markSold(reservationId: string) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const r = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { inventoryItem: true } });
    await releaseReservation(reservationId, user.id, true);
    refresh(r.inventoryItemId, r.inventoryItem.productModelId);
  }, "Registrato come venduto.");
}

const itemSchema = z.object({
  productModelId: z.string().min(1, "Seleziona il modello."),
  configurationId: z.string().nullable(),
  composition: z.string().nullable(),
  materialId: z.string().nullable(),
  finishId: z.string().nullable(),
  materialsDescription: z.string().nullable(),
  dimensions: z.string().nullable(),
  quantity: z.number().int().min(0, "Quantità non valida."),
  locationId: z.string().min(1, "Seleziona la sede."),
  zoneId: z.string().nullable(),
  baseStatus: z.enum(["ESPOSTO", "DISPONIBILE"]),
  price: z.number().min(0).nullable(),
  currency: z.enum(["EUR", "CHF"]),
  discountPct: z.number().min(0).max(100, "Sconto massimo 100%."),
  notes: z.string().nullable(),
});

function parseItem(form: FormData) {
  const price = str(form, "price");
  return itemSchema.parse({
    productModelId: str(form, "productModelId"),
    configurationId: optStr(form, "configurationId"),
    composition: optStr(form, "composition"),
    materialId: optStr(form, "materialId"),
    finishId: optStr(form, "finishId"),
    materialsDescription: optStr(form, "materialsDescription"),
    dimensions: optStr(form, "dimensions"),
    quantity: Number(str(form, "quantity") || 1),
    locationId: str(form, "locationId"),
    zoneId: optStr(form, "zoneId"),
    baseStatus: str(form, "baseStatus") || "DISPONIBILE",
    price: price === "" ? null : Number(price),
    currency: str(form, "currency") || "EUR",
    discountPct: Number(str(form, "discountPct") || 0),
    notes: optStr(form, "notes"),
  });
}

async function nextInventoryCode(locationId: string) {
  const loc = await db.location.findUniqueOrThrow({ where: { id: locationId } });
  const prefix = `PD-${loc.slug.slice(0, 3).toUpperCase()}-`;
  const last = await db.inventoryItem.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: "desc" } });
  const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export async function createInventoryItem(form: FormData) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const data = parseItem(form);
    const code = str(form, "code") || (await nextInventoryCode(data.locationId));
    const item = await db.inventoryItem.create({ data: { ...data, code, status: data.baseStatus } });
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    let i = 0;
    for (const f of files) {
      const s = await storeImage(f, "inventory");
      await db.inventoryImage.create({ data: { inventoryItemId: item.id, storageKey: s.key, mimeType: s.mime, width: s.width, height: s.height, sortOrder: i++ } });
    }
    await audit(user.id, "inventory.create", "InventoryItem", item.id, `Nuovo pezzo ${item.code}`);
    refresh(item.id, item.productModelId);
    return { id: item.id };
  }, "Pezzo aggiunto allo stock.");
}

export async function updateInventoryItem(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const data = parseItem(form);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${id} FOR UPDATE`;
      const before = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      const statusPatch = before.status === "ESPOSTO" || before.status === "DISPONIBILE" ? { status: data.baseStatus } : {};
      await tx.inventoryItem.update({ where: { id }, data: { ...data, ...statusPatch } });
      const agg = await tx.reservation.aggregate({ where: { inventoryItemId: id, status: "ACTIVE" }, _sum: { quantity: true } });
      if ((agg._sum.quantity ?? 0) > data.quantity) throw new AppError("La quantità non può essere inferiore ai pezzi riservati.");
      await syncReservedStatus(tx, id);
      await audit(user.id, "inventory.update", "InventoryItem", id, `Aggiornato pezzo ${before.code}`, undefined, tx);
    });
    refresh(id, data.productModelId);
  }, "Pezzo aggiornato.");
}

/** Manual status changes (sold, unavailable, back to display…). Reservations are handled separately. */
export async function setInventoryStatus(id: string, status: InventoryStatus) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
      const active = await tx.reservation.count({ where: { inventoryItemId: id, status: "ACTIVE" } });
      if (status === "RISERVATO") throw new AppError("Per riservare usa la funzione Riserva prodotto.");
      if (status === "IN_TRASFERIMENTO") throw new AppError("Per trasferire usa la funzione Trasferisci.");
      if (active > 0 && status !== item.status) throw new AppError("Rilascia prima le prenotazioni attive.");
      await tx.inventoryItem.update({
        where: { id },
        data: { status, ...(status === "ESPOSTO" || status === "DISPONIBILE" ? { baseStatus: status } : {}), transferToId: null },
      });
      await audit(user.id, "inventory.status", "InventoryItem", id, `${item.code}: ${INVENTORY_STATUS_LABELS[item.status]} → ${INVENTORY_STATUS_LABELS[status]}`, undefined, tx);
    });
    refresh(id);
  }, "Stato aggiornato.");
}

export async function startTransfer(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const to = str(form, "transferToId");
    if (!to) throw new AppError("Seleziona la sede di destinazione.");
    const immediate = str(form, "immediate") === "1";
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${id} FOR UPDATE`;
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id }, include: { location: true } });
      if (item.locationId === to) throw new AppError("Il pezzo si trova già in questa sede.");
      const dest = await tx.location.findUniqueOrThrow({ where: { id: to } });
      if (!["ESPOSTO", "DISPONIBILE", "RISERVATO"].includes(item.status)) throw new AppError("Questo pezzo non può essere trasferito ora.");
      const active = await tx.reservation.count({ where: { inventoryItemId: id, status: "ACTIVE" } });
      if (immediate) {
        await tx.inventoryItem.update({ where: { id }, data: { locationId: to, zoneId: optStr(form, "zoneId"), transferToId: null } });
      } else {
        if (active > 0) throw new AppError("Il pezzo ha prenotazioni attive: usa lo spostamento immediato o rilascia la prenotazione.");
        await tx.inventoryItem.update({ where: { id }, data: { status: "IN_TRASFERIMENTO", transferToId: to } });
      }
      await audit(user.id, "inventory.transfer", "InventoryItem", id, `${item.code}: ${item.location.name} → ${dest.name}${immediate ? "" : " (in transito)"}`, undefined, tx);
    });
    refresh(id);
  }, "Trasferimento registrato.");
}

export async function confirmArrival(id: string) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const item = await db.inventoryItem.findUniqueOrThrow({ where: { id }, include: { transferTo: true } });
    if (item.status !== "IN_TRASFERIMENTO" || !item.transferToId) throw new AppError("Nessun trasferimento in corso.");
    const dest = item.transferTo!;
    await db.inventoryItem.update({
      where: { id },
      data: { locationId: dest.id, zoneId: null, transferToId: null, status: dest.type === "SHOWROOM" ? "ESPOSTO" : "DISPONIBILE", baseStatus: dest.type === "SHOWROOM" ? "ESPOSTO" : "DISPONIBILE" },
    });
    await audit(user.id, "inventory.arrival", "InventoryItem", id, `${item.code} arrivato a ${dest.name}`);
    refresh(id);
  }, "Arrivo confermato.");
}

export async function uploadInventoryImages(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("inventory:edit");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError("Seleziona almeno una foto.");
    const count = await db.inventoryImage.count({ where: { inventoryItemId: id } });
    let i = count;
    for (const f of files) {
      const s = await storeImage(f, "inventory");
      await db.inventoryImage.create({ data: { inventoryItemId: id, storageKey: s.key, mimeType: s.mime, width: s.width, height: s.height, sortOrder: i++, caption: optStr(form, "caption") } });
    }
    await audit(user.id, "inventory.images", "InventoryItem", id, `Caricate ${files.length} foto reali`);
    refresh(id);
  }, "Foto caricate.");
}

export async function deleteInventoryImage(imageId: string) {
  return run(async () => {
    await assertUser("inventory:edit");
    const img = await db.inventoryImage.delete({ where: { id: imageId } });
    await deleteFile(img.storageKey);
    refresh(img.inventoryItemId);
  }, "Foto eliminata.");
}
