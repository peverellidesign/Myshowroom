import "server-only";
import type { AppointmentType } from "@prisma/client";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { addDays, dayKey, isoWeekday, minutesOfDay, zonedToUtc } from "./time";
import { emailConfigured, sendMail } from "./email";
import { renderTemplate } from "./email-templates";
import { getEmailSettings } from "./settings";
import { APPOINTMENT_TYPE_LABELS, fmtDateTime } from "./format";

export const SLOT_STEP = 30;
export const DEFAULT_DURATION = 60;



/** Consultants available at a location for [start, end), not already booked. */
async function freeConsultants(tx: Tx | typeof db, locationId: string, start: Date, end: Date, timeZone: string, excludeAppointmentId?: string) {
  const day = dayKey(start, timeZone);
  const wd = isoWeekday(day);
  const startMin = minutesOfDay(start, timeZone);
  const endMin = startMin + Math.round((end.getTime() - start.getTime()) / 60000);
  const avail = await tx.consultantAvailability.findMany({
    where: { locationId, weekday: wd, startMinute: { lte: startMin }, endMinute: { gte: endMin }, user: { active: true } },
    select: { userId: true },
  });
  if (!avail.length) return [];
  const busy = await tx.appointment.findMany({
    where: {
      consultantId: { in: avail.map((a) => a.userId) },
      status: "CONFERMATO",
      startsAt: { lt: end },
      endsAt: { gt: start },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { consultantId: true },
  });
  const busyIds = new Set(busy.map((b) => b.consultantId));
  return [...new Set(avail.map((a) => a.userId))].filter((id) => !busyIds.has(id));
}

/** Bookable slots for a location and day (public booking and internal helper). */
export async function availableSlots(locationId: string, day: string, duration = DEFAULT_DURATION) {
  const location = await db.location.findUniqueOrThrow({ where: { id: locationId } });
  const wd = isoWeekday(day);
  const windows = await db.consultantAvailability.findMany({ where: { locationId, weekday: wd } });
  if (!windows.length) return [];
  const from = Math.min(...windows.map((w) => w.startMinute));
  const to = Math.max(...windows.map((w) => w.endMinute));
  const dayStart = zonedToUtc(day, 0, location.timezone);
  const dayEnd = zonedToUtc(addDays(day, 1), 0, location.timezone);
  const appts = await db.appointment.findMany({
    where: { status: "CONFERMATO", startsAt: { lt: dayEnd }, endsAt: { gt: dayStart }, consultantId: { not: null } },
    select: { consultantId: true, startsAt: true, endsAt: true },
  });
  const minNotice = Date.now() + 2 * 3600_000;
  const slots: { minute: number; startsAt: Date }[] = [];
  for (let m = from; m + duration <= to; m += SLOT_STEP) {
    const start = zonedToUtc(day, m, location.timezone);
    const end = new Date(start.getTime() + duration * 60000);
    if (start.getTime() < minNotice) continue;
    const ok = windows.some(
      (w) => w.startMinute <= m && w.endMinute >= m + duration && !appts.some((a) => a.consultantId === w.userId && a.startsAt < end && a.endsAt > start),
    );
    if (ok) slots.push({ minute: m, startsAt: start });
  }
  return slots;
}

export type AppointmentInput = {
  locationId: string;
  day: string;
  minute: number;
  duration: number;
  type: AppointmentType;
  clientId: string | null;
  consultantId: string | null;
  notes: string | null;
  source: "INTERNO" | "PUBBLICO";
  autoAssign?: boolean;
};

/**
 * Validates and persists an appointment inside a transaction serialised per location
 * (pg_advisory_xact_lock), so two concurrent bookings cannot take the same consultant.
 * The DB exclusion constraint appointment_no_consultant_overlap is the final guard.
 */
export async function bookAppointment<T>(
  input: AppointmentInput,
  persist: (tx: Tx, slot: { startsAt: Date; endsAt: Date; consultantId: string | null }) => Promise<T>,
  opts: { excludeId?: string } = {},
) {
  const location = await db.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new AppError("Sede non trovata.");
  if (input.duration < 15 || input.duration > 480) throw new AppError("Durata non valida.");
  const startsAt = zonedToUtc(input.day, input.minute, location.timezone);
  const endsAt = new Date(startsAt.getTime() + input.duration * 60000);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"appt:" + input.locationId}))`;
    let consultantId = input.consultantId;
    if (!consultantId && input.autoAssign) {
      const free = await freeConsultants(tx, input.locationId, startsAt, endsAt, location.timezone, opts.excludeId);
      if (!free.length) throw new AppError("Orario non più disponibile. Scegli un altro orario.");
      consultantId = free[0];
    }
    if (consultantId) {
      const clash = await tx.appointment.findFirst({
        where: { consultantId, status: "CONFERMATO", startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}) },
        include: { location: true },
      });
      if (clash) throw new AppError(`Il consulente ha già un appuntamento alle ${fmtDateTime(clash.startsAt)} (${clash.location.name}).`);
    }
    return persist(tx, { startsAt, endsAt, consultantId });
  });
}

/** Sends the appointment confirmation email when SMTP is configured. Never throws. */
export async function sendAppointmentConfirmation(appointmentId: string, createdById: string) {
  if (!emailConfigured()) return false;
  const a = await db.appointment.findUnique({ where: { id: appointmentId }, include: { client: true, location: true, consultant: true } });
  if (!a?.client?.email) return false;
  const settings = await getEmailSettings();
  const { subject, body } = renderTemplate("appuntamento", {
    cliente: a.client.name,
    consulente: a.consultant?.name ?? "Il team Peverelli Design",
    firma: settings.signature,
    showroom: a.location.name,
    data: `${fmtDateTime(a.startsAt)} (${APPOINTMENT_TYPE_LABELS[a.type]})`,
  });
  const msg = await db.emailMessage.create({ data: { to: a.client.email, subject, body, clientId: a.clientId, template: "appuntamento", createdById } });
  try {
    const providerId = await sendMail({ to: a.client.email, subject, text: body, replyTo: settings.replyTo || undefined });
    await db.emailMessage.update({ where: { id: msg.id }, data: { status: "INVIATA", sentAt: new Date(), providerId } });
    return true;
  } catch (e) {
    await db.emailMessage.update({ where: { id: msg.id }, data: { status: "ERRORE", error: (e as Error).message.slice(0, 500) } });
    return false;
  }
}
