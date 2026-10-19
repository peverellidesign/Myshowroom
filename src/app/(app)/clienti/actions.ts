"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { optStr, str } from "@/lib/utils";

const clientSchema = z.object({
  name: z.string().min(1, "Inserisci nome e cognome."),
  email: z.string().email("Email non valida.").nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  city: z.string().nullable(),
  preferredLocationId: z.string().nullable(),
  consultantId: z.string().nullable(),
  notes: z.string().nullable(),
});

function parse(form: FormData) {
  return clientSchema.parse({
    name: str(form, "name"),
    email: optStr(form, "email")?.toLowerCase() ?? null,
    phone: optStr(form, "phone"),
    company: optStr(form, "company"),
    city: optStr(form, "city"),
    preferredLocationId: optStr(form, "preferredLocationId"),
    consultantId: optStr(form, "consultantId"),
    notes: optStr(form, "notes"),
  });
}

export async function createClient(form: FormData) {
  return run(async () => {
    const user = await assertUser("client:edit");
    const data = parse(form);
    const c = await db.client.create({ data: { ...data, consultantId: data.consultantId ?? user.id } });
    const interests = form.getAll("productIds").map(String).filter(Boolean);
    if (interests.length) await db.clientInterest.createMany({ data: interests.map((productModelId) => ({ clientId: c.id, productModelId })), skipDuplicates: true });
    await audit(user.id, "client.create", "Client", c.id, `Nuovo cliente ${c.name}`);
    revalidatePath("/clienti");
    return { id: c.id };
  }, "Cliente salvato.");
}

export async function updateClient(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("client:edit");
    const data = parse(form);
    await db.client.update({ where: { id }, data });
    await audit(user.id, "client.update", "Client", id, `Aggiornato cliente ${data.name}`);
    revalidatePath(`/clienti/${id}`);
  }, "Cliente aggiornato.");
}

export async function deleteClient(id: string) {
  return run(async () => {
    const user = await assertUser("client:edit");
    const active = await db.reservation.count({ where: { clientId: id, status: "ACTIVE" } });
    if (active) throw new AppError("Il cliente ha prenotazioni attive: rilasciale prima di eliminarlo.");
    const c = await db.client.delete({ where: { id } });
    await audit(user.id, "client.delete", "Client", id, `Eliminato cliente ${c.name}`);
    revalidatePath("/clienti");
  }, "Cliente eliminato.");
}

export async function addInterests(clientId: string, form: FormData) {
  return run(async () => {
    await assertUser("client:edit");
    const ids = form.getAll("productIds").map(String).filter(Boolean);
    if (!ids.length) throw new AppError("Seleziona almeno un prodotto.");
    await db.clientInterest.createMany({ data: ids.map((productModelId) => ({ clientId, productModelId })), skipDuplicates: true });
    revalidatePath(`/clienti/${clientId}`);
  }, "Prodotti di interesse aggiornati.");
}

export async function removeInterest(clientId: string, productModelId: string) {
  return run(async () => {
    await assertUser("client:edit");
    await db.clientInterest.delete({ where: { clientId_productModelId: { clientId, productModelId } } });
    revalidatePath(`/clienti/${clientId}`);
  });
}

export async function recordVisit(form: FormData) {
  return run(async () => {
    const user = await assertUser("client:edit");
    let clientId = str(form, "clientId");
    // Quick path: register a brand-new client together with the visit.
    if (!clientId) {
      const name = str(form, "newClientName");
      if (!name) throw new AppError("Seleziona un cliente o inserisci il nome di un nuovo cliente.");
      const email = optStr(form, "newClientEmail");
      if (email && !z.string().email().safeParse(email).success) throw new AppError("Email non valida.");
      const c = await db.client.create({ data: { name, email: email?.toLowerCase(), phone: optStr(form, "newClientPhone"), consultantId: user.id, preferredLocationId: optStr(form, "locationId") } });
      clientId = c.id;
    }
    const locationId = str(form, "locationId");
    if (!locationId) throw new AppError("Seleziona lo showroom.");
    const date = str(form, "date");
    const productIds = [...new Set(form.getAll("productIds").map(String).filter(Boolean))];
    const visit = await db.showroomVisit.create({
      data: {
        clientId,
        locationId,
        date: date ? new Date(date) : new Date(),
        consultantId: optStr(form, "consultantId") ?? user.id,
        budget: optStr(form, "budget"),
        projectType: optStr(form, "projectType"),
        timeline: optStr(form, "timeline"),
        preferences: optStr(form, "preferences"),
        notes: optStr(form, "notes"),
        nextAction: optStr(form, "nextAction"),
        products: { create: productIds.map((productModelId) => ({ productModelId })) },
      },
    });
    if (productIds.length) await db.clientInterest.createMany({ data: productIds.map((productModelId) => ({ clientId, productModelId })), skipDuplicates: true });
    const followUp = str(form, "followUpDate");
    if (followUp) {
      await db.task.create({
        data: {
          title: optStr(form, "nextAction") ?? "Follow-up dopo visita showroom",
          dueDate: new Date(`${followUp}T09:00:00`),
          priority: "MEDIA",
          assigneeId: user.id,
          createdById: user.id,
          clientId,
        },
      });
    }
    await audit(user.id, "visit.create", "Client", clientId, `Registrata visita showroom (${productIds.length} prodotti visti)`, { visitId: visit.id });
    revalidatePath(`/clienti/${clientId}`);
    revalidatePath("/clienti");
    return { clientId, visitId: visit.id };
  }, "Visita registrata.");
}

export async function createFollowUp(clientId: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("task:edit");
    const title = str(form, "title");
    if (!title) throw new AppError("Inserisci il titolo dell'attività.");
    const due = str(form, "dueDate");
    await db.task.create({
      data: { title, dueDate: due ? new Date(`${due}T09:00:00`) : null, priority: "MEDIA", assigneeId: user.id, createdById: user.id, clientId },
    });
    revalidatePath(`/clienti/${clientId}`);
  }, "Follow-up creato.");
}
