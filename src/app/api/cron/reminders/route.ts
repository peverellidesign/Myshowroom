import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailConfigured, sendMail } from "@/lib/email";
import { getEmailSettings } from "@/lib/settings";
import { APPOINTMENT_TYPE_LABELS, fmtDateTime } from "@/lib/format";

/**
 * Sends reminder emails for confirmed appointments in the next 24 hours.
 * Call periodically (e.g. hourly) with header `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ sent: 0, skipped: "email non configurata" });
  const settings = await getEmailSettings();
  const due = await db.appointment.findMany({
    where: { status: "CONFERMATO", reminderSentAt: null, startsAt: { gt: new Date(), lt: new Date(Date.now() + 24 * 3600_000) }, client: { email: { not: null } } },
    include: { client: true, location: true, consultant: true },
  });
  let sent = 0;
  for (const a of due) {
    const subject = "Promemoria appuntamento — Peverelli Design";
    const body = `Gentile ${a.client!.name},\n\nle ricordiamo il suo appuntamento (${APPOINTMENT_TYPE_LABELS[a.type]}) ${fmtDateTime(a.startsAt)} presso lo showroom di ${a.location.name}.\n\nA presto,\n${a.consultant?.name ?? "Il team Peverelli Design"}\n${settings.signature}`;
    try {
      await sendMail({ to: a.client!.email!, subject, text: body, replyTo: settings.replyTo || undefined });
      await db.appointment.update({ where: { id: a.id }, data: { reminderSentAt: new Date() } });
      if (a.consultantId) {
        await db.emailMessage.create({ data: { to: a.client!.email!, subject, body, clientId: a.clientId, template: "promemoria", status: "INVIATA", sentAt: new Date(), createdById: a.consultantId } });
      }
      sent++;
    } catch (e) {
      console.error("Reminder failed", a.id, e);
    }
  }
  return NextResponse.json({ sent, candidates: due.length });
}
