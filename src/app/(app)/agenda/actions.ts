"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { APPOINTMENT_TYPE_LABELS, fmtDateTime } from "@/lib/format";
import { bookAppointment, sendAppointmentConfirmation } from "@/lib/booking";
import { hhmmToMinutes } from "@/lib/time";
import { optStr, str } from "@/lib/utils";

function parseSlot(form: FormData) {
  const day = str(form, "day");
  const time = str(form, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) throw new AppError("Indica data e ora.");
  const type = str(form, "type") as AppointmentType;
  if (!(type in APPOINTMENT_TYPE_LABELS)) throw new AppError("Seleziona il tipo di consulenza.");
  const locationId = str(form, "locationId");
  if (!locationId) throw new AppError("Seleziona lo showroom.");
  return { day, minute: hhmmToMinutes(time), duration: Number(str(form, "duration") || 60), type, locationId };
}

function refresh() {
  revalidatePath("/agenda");
  revalidatePath("/");
}

export async function createAppointment(form: FormData) {
  return run(async () => {
    const user = await assertUser("appointment:edit");
    const slot = parseSlot(form);
    const clientId = optStr(form, "clientId");
    const appt = await bookAppointment(
      { ...slot, clientId, consultantId: optStr(form, "consultantId"), notes: optStr(form, "notes"), source: "INTERNO", autoAssign: str(form, "consultantId") === "" },
      async (tx, s) => {
        const a = await tx.appointment.create({
          data: { locationId: slot.locationId, type: slot.type, clientId, consultantId: s.consultantId, startsAt: s.startsAt, endsAt: s.endsAt, notes: optStr(form, "notes"), source: "INTERNO" },
        });
        await audit(user.id, "appointment.create", "Appointment", a.id, `Appuntamento ${APPOINTMENT_TYPE_LABELS[slot.type]} il ${fmtDateTime(s.startsAt)}`, undefined, tx);
        return a;
      },
    ).catch((e) => {
      // No free consultant: keep the appointment unassigned rather than refusing it.
      if (e instanceof AppError && e.message.startsWith("Orario non più disponibile")) {
        return bookAppointment({ ...slot, clientId, consultantId: null, notes: null, source: "INTERNO" }, (tx, s) =>
          tx.appointment.create({ data: { locationId: slot.locationId, type: slot.type, clientId, startsAt: s.startsAt, endsAt: s.endsAt, notes: optStr(form, "notes"), source: "INTERNO" } }),
        );
      }
      throw e;
    });
    if (str(form, "sendConfirmation") === "1") await sendAppointmentConfirmation(appt.id, user.id);
    refresh();
    if (clientId) revalidatePath(`/clienti/${clientId}`);
    return { id: appt.id, day: slot.day };
  }, "Appuntamento salvato.");
}

export async function rescheduleAppointment(id: string, form: FormData) {
  return run(async () => {
    const user = await assertUser("appointment:edit");
    const existing = await db.appointment.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "CONFERMATO") throw new AppError("Si possono riprogrammare solo appuntamenti confermati.");
    const slot = parseSlot(form);
    const consultantId = optStr(form, "consultantId");
    await bookAppointment(
      { ...slot, clientId: existing.clientId, consultantId, notes: null, source: existing.source },
      async (tx, s) => {
        const history = [
          ...((existing.history as Prisma.JsonArray) ?? []),
          { from: existing.startsAt.toISOString(), to: s.startsAt.toISOString(), at: new Date().toISOString(), by: user.name },
        ];
        await tx.appointment.update({
          where: { id },
          data: { startsAt: s.startsAt, endsAt: s.endsAt, locationId: slot.locationId, type: slot.type, consultantId: s.consultantId, notes: optStr(form, "notes"), history, reminderSentAt: null },
        });
        await audit(user.id, "appointment.reschedule", "Appointment", id, `Riprogrammato: ${fmtDateTime(existing.startsAt)} → ${fmtDateTime(s.startsAt)}`, undefined, tx);
      },
      { excludeId: id },
    );
    refresh();
  }, "Appuntamento riprogrammato.");
}

export async function setAppointmentStatus(id: string, status: "ANNULLATO" | "COMPLETATO") {
  return run(async () => {
    const user = await assertUser("appointment:edit");
    const a = await db.appointment.update({ where: { id }, data: { status } });
    await audit(user.id, `appointment.${status === "ANNULLATO" ? "cancel" : "complete"}`, "Appointment", id, `${status === "ANNULLATO" ? "Annullato" : "Completato"} appuntamento del ${fmtDateTime(a.startsAt)}`);
    refresh();
    if (a.clientId) revalidatePath(`/clienti/${a.clientId}`);
  }, status === "ANNULLATO" ? "Appuntamento annullato." : "Appuntamento completato.");
}
