import "server-only";
import type { InventoryStatus } from "@prisma/client";
import { db, type Tx } from "./db";
import { audit } from "./audit";
import { AppError } from "./errors";



/** Marks expired reservations and restores the base status of their items. Idempotent and cheap. */
export async function expireReservations() {
  const expired = await db.reservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    select: { id: true, inventoryItemId: true },
  });
  for (const r of expired) {
    await db.$transaction(async (tx) => {
      const res = await tx.reservation.updateMany({
        where: { id: r.id, status: "ACTIVE" },
        data: { status: "EXPIRED", releasedAt: new Date() },
      });
      if (res.count) {
        await syncReservedStatus(tx, r.inventoryItemId);
        await audit(null, "reservation.expire", "Reservation", r.id, "Prenotazione scaduta automaticamente", undefined, tx);
      }
    });
  }
}

/** Recomputes RISERVATO vs base status from the active reservations. Caller holds the row lock. */
export async function syncReservedStatus(tx: Tx, inventoryItemId: string) {
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } });
  const agg = await tx.reservation.aggregate({
    where: { inventoryItemId, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  const reserved = agg._sum.quantity ?? 0;
  if (item.status === "RISERVATO" || item.status === "ESPOSTO" || item.status === "DISPONIBILE") {
    const next: InventoryStatus = reserved >= item.quantity && item.quantity > 0 ? "RISERVATO" : item.baseStatus;
    if (next !== item.status) await tx.inventoryItem.update({ where: { id: item.id }, data: { status: next } });
  }
  return { reserved, available: Math.max(0, item.quantity - reserved) };
}

/**
 * Creates a reservation atomically. The inventory row is locked (SELECT … FOR UPDATE)
 * so two consultants can never reserve the same piece; a database trigger
 * (reservation_capacity_guard) enforces the same rule as a second line of defence.
 */
export async function reserveItem(input: {
  inventoryItemId: string;
  clientId: string;
  quantity: number;
  expiresAt: Date;
  notes: string | null;
  userId: string;
}) {
  if (input.quantity < 1) throw new AppError("Quantità non valida.");
  if (input.expiresAt <= new Date()) throw new AppError("La scadenza deve essere nel futuro.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${input.inventoryItemId} FOR UPDATE`;
    const item = await tx.inventoryItem.findUnique({
      where: { id: input.inventoryItemId },
      include: { productModel: true, location: true },
    });
    if (!item) throw new AppError("Pezzo non trovato.", 404);
    if (!["ESPOSTO", "DISPONIBILE", "RISERVATO"].includes(item.status)) {
      throw new AppError("Questo pezzo non è riservabile nel suo stato attuale.");
    }
    const agg = await tx.reservation.aggregate({
      where: { inventoryItemId: item.id, status: "ACTIVE" },
      _sum: { quantity: true },
    });
    const available = item.quantity - (agg._sum.quantity ?? 0);
    if (input.quantity > available) {
      throw new AppError(available <= 0 ? "Pezzo già riservato." : `Disponibili solo ${available} pezzi.`);
    }
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw new AppError("Cliente non trovato.");
    const reservation = await tx.reservation.create({
      data: {
        inventoryItemId: item.id,
        clientId: client.id,
        quantity: input.quantity,
        expiresAt: input.expiresAt,
        notes: input.notes,
        createdById: input.userId,
      },
    });
    await syncReservedStatus(tx, item.id);
    await audit(
      input.userId,
      "reservation.create",
      "InventoryItem",
      item.id,
      `Riservato ${item.productModel.name} (${item.code}, ${item.location.name}) per ${client.name}`,
      { reservationId: reservation.id, quantity: input.quantity },
      tx,
    );
    return reservation;
  });
}

export async function releaseReservation(reservationId: string, userId: string, converted = false) {
  return db.$transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id: reservationId }, include: { client: true } });
    if (!r) throw new AppError("Prenotazione non trovata.", 404);
    if (r.status !== "ACTIVE") throw new AppError("La prenotazione non è più attiva.");
    await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${r.inventoryItemId} FOR UPDATE`;
    await tx.reservation.update({
      where: { id: r.id },
      data: { status: converted ? "CONVERTED" : "RELEASED", releasedAt: new Date() },
    });
    if (converted) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: r.inventoryItemId } });
      const remaining = item.quantity - r.quantity;
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: remaining <= 0 ? { quantity: 0, status: "VENDUTO" } : { quantity: remaining },
      });
    }
    await syncReservedStatus(tx, r.inventoryItemId);
    await audit(
      userId,
      converted ? "reservation.sold" : "reservation.release",
      "InventoryItem",
      r.inventoryItemId,
      converted ? `Venduto a ${r.client.name}` : `Prenotazione rilasciata (${r.client.name})`,
      { reservationId: r.id },
      tx,
    );
  });
}
