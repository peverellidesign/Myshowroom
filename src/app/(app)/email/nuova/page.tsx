import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { composerContext } from "@/lib/email-context";
import { EmailComposer } from "@/components/email-composer";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Invia proposta" };

export default async function NewEmailPage({ searchParams }: { searchParams: Promise<{ cliente?: string; preventivo?: string; modello?: string }> }) {
  const user = await requireUser("email:send");
  const sp = await searchParams;
  const ctx = await composerContext(user, { clientId: sp.cliente, quotationId: sp.preventivo });
  const back = ctx.quotation && sp.preventivo ? `/preventivi/${ctx.quotation.id}` : ctx.client ? `/clienti/${ctx.client.id}` : "/clienti";
  return (
    <div className="mx-auto max-w-3xl animate-fadein">
      <Link href={back} className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Indietro
      </Link>
      <PageHeader eyebrow="Comunicazione" title="Invia proposta." subtitle={ctx.client ? `A ${ctx.client.name}` : "Componi il messaggio"} />
      <div className="card p-5 sm:p-7">
        <EmailComposer
          configured={emailConfigured()}
          templates={ctx.templates}
          initialTemplate={sp.modello ?? (ctx.quotation ? "preventivo" : "visita")}
          to={ctx.client?.email ?? ""}
          clientId={ctx.client?.id ?? null}
          quotation={ctx.quotation}
        />
      </div>
    </div>
  );
}
