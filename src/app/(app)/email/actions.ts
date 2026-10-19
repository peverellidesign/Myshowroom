"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { emailConfigured, sendMail } from "@/lib/email";
import { getEmailSettings } from "@/lib/settings";
import { renderQuotationPdf } from "@/lib/pdf/quotation";
import { optStr, str } from "@/lib/utils";

const schema = z.object({
  to: z.string().email("Inserisci un indirizzo email valido."),
  subject: z.string().min(1, "Inserisci l'oggetto."),
  body: z.string().min(1, "Il messaggio è vuoto."),
});

function parse(form: FormData) {
  const data = schema.parse({ to: str(form, "to"), subject: str(form, "subject"), body: str(form, "body") });
  return {
    ...data,
    clientId: optStr(form, "clientId"),
    quotationId: optStr(form, "quotationId"),
    template: optStr(form, "template"),
    attachPdf: str(form, "attachPdf") === "1" && Boolean(optStr(form, "quotationId")),
  };
}

async function upsertDraft(form: FormData, userId: string) {
  const data = parse(form);
  const id = optStr(form, "emailId");
  if (id) {
    const existing = await db.emailMessage.findUniqueOrThrow({ where: { id } });
    if (existing.status === "INVIATA") throw new AppError("Questa email è già stata inviata.");
    return db.emailMessage.update({ where: { id }, data: { ...data, status: "BOZZA", error: null } });
  }
  return db.emailMessage.create({ data: { ...data, createdById: userId } });
}

export async function saveDraft(form: FormData) {
  return run(async () => {
    const user = await assertUser("email:send");
    const msg = await upsertDraft(form, user.id);
    await audit(user.id, "email.draft", "EmailMessage", msg.id, `Bozza salvata per ${msg.to}`);
    if (msg.clientId) revalidatePath(`/clienti/${msg.clientId}`);
    return { id: msg.id };
  }, "Bozza salvata.");
}

export async function sendEmail(form: FormData) {
  return run(async () => {
    const user = await assertUser("email:send");
    if (!emailConfigured()) throw new AppError("Invio non disponibile: il server email non è configurato. Salva la bozza o copia il testo.");
    const msg = await upsertDraft(form, user.id);
    const settings = await getEmailSettings();
    try {
      const attachments = [];
      if (msg.attachPdf && msg.quotationId) {
        const pdf = await renderQuotationPdf(msg.quotationId);
        attachments.push({ filename: pdf.fileName, content: pdf.buffer, contentType: "application/pdf" });
      }
      const providerId = await sendMail({ to: msg.to, subject: msg.subject, text: msg.body, replyTo: settings.replyTo || user.email, attachments });
      await db.emailMessage.update({ where: { id: msg.id }, data: { status: "INVIATA", sentAt: new Date(), providerId, error: null } });
      if (msg.quotationId) {
        await db.quotation.updateMany({ where: { id: msg.quotationId, status: "BOZZA" }, data: { status: "INVIATO" } });
      }
      await audit(user.id, "email.sent", "EmailMessage", msg.id, `Email inviata a ${msg.to}`);
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 500) : "Errore sconosciuto";
      await db.emailMessage.update({ where: { id: msg.id }, data: { status: "ERRORE", error } });
      await audit(user.id, "email.error", "EmailMessage", msg.id, `Invio fallito a ${msg.to}`, { error });
      throw new AppError(`Invio non riuscito: ${error}`);
    } finally {
      if (msg.clientId) revalidatePath(`/clienti/${msg.clientId}`);
      if (msg.quotationId) revalidatePath(`/preventivi/${msg.quotationId}`);
    }
    return { id: msg.id };
  }, "Email inviata.");
}

export async function deleteDraft(id: string) {
  return run(async () => {
    await assertUser("email:send");
    const msg = await db.emailMessage.findUniqueOrThrow({ where: { id } });
    if (msg.status === "INVIATA") throw new AppError("Le email inviate restano nello storico.");
    await db.emailMessage.delete({ where: { id } });
    if (msg.clientId) revalidatePath(`/clienti/${msg.clientId}`);
  }, "Bozza eliminata.");
}
