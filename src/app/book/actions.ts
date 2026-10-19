"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { AppointmentType } from "@prisma/client";
import { db } from "@/lib/db";
import { errorMessage } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { bookAppointment, sendAppointmentConfirmation } from "@/lib/booking";
import { APPOINTMENT_TYPE_LABELS, fmtDateTime } from "@/lib/format";
import { hhmmToMinutes } from "@/lib/time";

const schema = z.object({
  slug: z.string().min(1),
  type: z.enum(["CONSULENZA_ARREDO", "PROGETTO_CUCINA", "INTERIOR_DESIGN", "VISITA_SHOWROOM", "PRESENTAZIONE_PREVENTIVO", "APPUNTAMENTO_ARCHITETTO"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Seleziona una data."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Seleziona un orario."),
  name: z.string().min(2, "Inserisci nome e cognome.").max(120),
  email: z.string().email("Inserisci un'email valida.").max(200),
  phone: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
  privacy: z.literal("1", { errorMap: () => ({ message: "È necessario accettare il trattamento dei dati." }) }),
});

const recent = new Map<string, number[]>();

export async function publicBooking(form: FormData): Promise<{ ok: true; when: string; location: string } | { ok: false; error: string }> {
  try {
    if (form.get("website")) throw new AppError("Richiesta non valida."); // honeypot
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (hits.length >= 5) throw new AppError("Troppe richieste. Riprova più tardi o contatta lo showroom.");
    recent.set(ip, [...hits, now]);

    const d = schema.parse(Object.fromEntries(["slug", "type", "day", "time", "name", "email", "phone", "notes", "privacy"].map((k) => [k, (form.get(k) as string | null)?.trim() || undefined])));
    const location = await db.location.findFirst({ where: { slug: d.slug, bookingEnabled: true, active: true } });
    if (!location) throw new AppError("Showroom non disponibile per la prenotazione online.");

    const email = d.email.toLowerCase();
    let client = await db.client.findFirst({ where: { email } });
    if (!client) client = await db.client.create({ data: { name: d.name, email, phone: d.phone, preferredLocationId: location.id, notes: "Registrato tramite prenotazione online." } });

    const appt = await bookAppointment(
      { locationId: location.id, day: d.day, minute: hhmmToMinutes(d.time), duration: 60, type: d.type as AppointmentType, clientId: client.id, consultantId: null, notes: d.notes ?? null, source: "PUBBLICO", autoAssign: true },
      async (tx, s) => {
        if (s.startsAt.getTime() < Date.now() + 2 * 3600_000) throw new AppError("Seleziona un orario con almeno 2 ore di preavviso.");
        const a = await tx.appointment.create({
          data: {
            locationId: location.id,
            type: d.type as AppointmentType,
            clientId: client!.id,
            consultantId: s.consultantId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            source: "PUBBLICO",
            notes: [d.notes, d.phone && `Tel. ${d.phone}`, d.name !== client!.name ? `Prenotato a nome: ${d.name}` : null].filter(Boolean).join("\n") || null,
          },
        });
        if (s.consultantId) {
          await tx.task.create({
            data: { title: `Preparare appuntamento online: ${client!.name}`, dueDate: s.startsAt, priority: "MEDIA", assigneeId: s.consultantId, createdById: s.consultantId, clientId: client!.id, appointmentId: a.id },
          });
        }
        await audit(null, "appointment.public", "Appointment", a.id, `Prenotazione online ${APPOINTMENT_TYPE_LABELS[a.type]} — ${location.name}`, undefined, tx);
        return a;
      },
    );
    if (appt.consultantId) await sendAppointmentConfirmation(appt.id, appt.consultantId);
    return { ok: true, when: fmtDateTime(appt.startsAt), location: location.name };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
