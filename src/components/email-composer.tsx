"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Copy, FileText, Loader2, Save, Send } from "lucide-react";
import { useToast } from "./ui/toast";
import { buttonClass } from "./ui/button";
import { saveDraft, sendEmail } from "@/app/(app)/email/actions";

type Template = { key: string; label: string; subject: string; body: string };

export function EmailComposer({
  configured,
  templates,
  initialTemplate,
  to,
  clientId,
  quotation,
  draft,
}: {
  configured: boolean;
  templates: Template[];
  initialTemplate: string;
  to: string;
  clientId: string | null;
  quotation: { id: string; number: string; total: string; lines: string[] } | null;
  draft?: { id: string; subject: string; body: string; attachPdf: boolean; template: string | null };
}) {
  const first = templates.find((t) => t.key === (draft?.template ?? initialTemplate)) ?? templates[0];
  const [template, setTemplate] = useState(first.key);
  const [subject, setSubject] = useState(draft?.subject ?? first.subject);
  const [body, setBody] = useState(draft?.body ?? first.body);
  const [emailId, setEmailId] = useState(draft?.id ?? "");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  function act(kind: "send" | "draft") {
    if (!form.current?.reportValidity()) return;
    const fd = new FormData(form.current);
    start(async () => {
      const res = kind === "send" ? await sendEmail(fd) : await saveDraft(fd);
      if (!res.ok) {
        toast(res.error, true);
        router.refresh();
        return;
      }
      toast(res.message ?? "Fatto.");
      if (res.data?.id) {
        setEmailId(res.data.id);
        router.push(`/email/${res.data.id}`);
      }
    });
  }

  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <input type="hidden" name="emailId" value={emailId} />
      <input type="hidden" name="clientId" value={clientId ?? ""} />
      <input type="hidden" name="quotationId" value={quotation?.id ?? ""} />
      <input type="hidden" name="template" value={template} />
      {!configured && (
        <div className="flex gap-3 rounded-2xl border border-warning/20 bg-warning-bg px-4 py-3 text-sm text-warning">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-medium">Invio non disponibile.</strong> Il server email (SMTP) non è ancora configurato dall&apos;amministratore. Puoi salvare la bozza nello storico del
            cliente oppure copiare il testo. Il PDF del preventivo si scarica separatamente: un link «mailto» non può allegarlo automaticamente.
          </p>
        </div>
      )}
      <label className="block">
        <span className="label">Modello</span>
        <select
          className="field"
          value={template}
          onChange={(e) => {
            const t = templates.find((x) => x.key === e.target.value)!;
            setTemplate(t.key);
            setSubject(t.subject);
            setBody(t.body);
          }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Destinatario</span>
        <input name="to" type="email" defaultValue={to} required className="field" placeholder="email@cliente.com" />
      </label>
      <label className="block">
        <span className="label">Oggetto</span>
        <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required className="field" />
      </label>
      <label className="block">
        <span className="label">Messaggio</span>
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} required className="field leading-relaxed" />
      </label>
      {quotation && (
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <FileText size={20} strokeWidth={1.4} className="mt-0.5 shrink-0 text-soft" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">
                Preventivo {quotation.number} · {quotation.total}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-soft">
                {quotation.lines.map((l, i) => (
                  <li key={i} className="truncate">
                    {l}
                  </li>
                ))}
              </ul>
              <a href={`/api/quotations/${quotation.id}/pdf?inline=1`} target="_blank" className="mt-2 inline-block text-sm link-quiet">
                Anteprima PDF
              </a>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-[15px]">
            <input type="checkbox" name="attachPdf" value="1" defaultChecked={draft?.attachPdf ?? true} className="h-5 w-5 accent-[#222]" />
            Allega il PDF del preventivo
          </label>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => act("send")} disabled={!configured || pending} className={buttonClass("primary", "md")} title={configured ? "" : "Server email non configurato"}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Invia
        </button>
        <button type="button" onClick={() => act("draft")} disabled={pending} className={buttonClass("secondary", "md")}>
          <Save size={16} /> Salva bozza
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Oggetto: ${subject}\n\n${body}`);
              toast("Testo copiato negli appunti.");
            } catch {
              toast("Copia non riuscita.", true);
            }
          }}
          className={buttonClass("secondary", "md")}
        >
          <Copy size={16} /> Copia testo
        </button>
      </div>
    </form>
  );
}
