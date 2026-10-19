import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { composerContext } from "@/lib/email-context";
import { fmtDateTime } from "@/lib/format";
import { EmailComposer } from "@/components/email-composer";
import { ActionButton } from "@/components/ui/action-form";
import { Badge, KeyValue, PageHeader } from "@/components/ui/misc";
import { deleteDraft } from "../actions";

export const metadata = { title: "Email" };

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("email:send");
  const { id } = await params;
  const msg = await db.emailMessage.findUnique({ where: { id }, include: { client: true, quotation: true, createdBy: true } });
  if (!msg) notFound();
  const back = msg.clientId ? `/clienti/${msg.clientId}` : msg.quotationId ? `/preventivi/${msg.quotationId}` : "/clienti";
  const statusLabel = msg.status === "INVIATA" ? "Inviata" : msg.status === "ERRORE" ? "Invio non riuscito" : "Bozza";

  return (
    <div className="mx-auto max-w-3xl animate-fadein">
      <Link href={back} className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Indietro
      </Link>
      <PageHeader
        eyebrow="Comunicazione"
        title={msg.subject}
        actions={
          <>
            <Badge tone={msg.status === "INVIATA" ? "success" : msg.status === "ERRORE" ? "danger" : "neutral"}>{statusLabel}</Badge>
            {msg.status !== "INVIATA" && (
              <ActionButton action={deleteDraft.bind(null, msg.id)} confirm="Eliminare la bozza?" redirectTo={back} variant="ghost">
                <Trash2 size={14} />
              </ActionButton>
            )}
          </>
        }
      />
      {msg.status === "INVIATA" ? (
        <div className="space-y-5">
          <div className="card px-5 py-2">
            <KeyValue
              items={[
                ["Destinatario", msg.to],
                ["Inviata il", fmtDateTime(msg.sentAt)],
                ["Da", msg.createdBy.name],
                ["Allegato", msg.attachPdf && msg.quotation ? `Preventivo ${msg.quotation.number} (PDF)` : "—"],
                ["ID messaggio", <span key="p" className="break-all text-xs">{msg.providerId}</span>],
              ]}
            />
          </div>
          <div className="card whitespace-pre-line p-6 text-[15px] leading-relaxed">{msg.body}</div>
        </div>
      ) : (
        <>
          {msg.error && <p className="mb-4 rounded-2xl bg-[#F6ECEC] px-4 py-3 text-sm text-[#8E2F2F]">Ultimo tentativo: {msg.error}</p>}
          <div className="card p-5 sm:p-7">
            <EmailComposer
              configured={emailConfigured()}
              {...(await composerContext(user, { clientId: msg.clientId, quotationId: msg.quotationId }).then(({ templates, quotation }) => ({ templates, quotation })))}
              initialTemplate={msg.template ?? "preventivo"}
              to={msg.to}
              clientId={msg.clientId}
              draft={{ id: msg.id, subject: msg.subject, body: msg.body, attachPdf: msg.attachPdf, template: msg.template }}
            />
          </div>
        </>
      )}
    </div>
  );
}
