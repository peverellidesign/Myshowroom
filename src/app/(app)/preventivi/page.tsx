import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma, QuotationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { quotationTotals } from "@/lib/quotations";
import { QUOTATION_STATUS_LABELS, fmtDate, money } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Preventivi" };

const tone: Record<QuotationStatus, "neutral" | "warning" | "success" | "danger" | "outline"> = {
  BOZZA: "neutral",
  INVIATO: "outline",
  IN_TRATTATIVA: "warning",
  ACCETTATO: "success",
  RIFIUTATO: "danger",
};

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ stato?: string; q?: string }> }) {
  const user = await requireUser("quote:view");
  const sp = await searchParams;
  const where: Prisma.QuotationWhereInput = {};
  if (sp.stato) where.status = sp.stato as QuotationStatus;
  if (sp.q) where.OR = [{ number: { contains: sp.q, mode: "insensitive" } }, { client: { name: { contains: sp.q, mode: "insensitive" } } }, { title: { contains: sp.q, mode: "insensitive" } }];
  const quotations = await db.quotation.findMany({ where, include: { client: true, items: true, createdBy: true }, orderBy: { updatedAt: "desc" }, take: 200 });

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="04 / Smart quotations"
        title="La proposta."
        subtitle="Dalla selezione alla condivisione."
        actions={
          can(user.role, "quote:edit") && (
            <LinkButton href="/preventivi/nuovo" size="sm">
              <Plus size={15} /> Nuovo preventivo
            </LinkButton>
          )
        }
      />
      <form className="mb-3">
        <input name="q" defaultValue={sp.q} placeholder="Cerca per numero, cliente o titolo…" className="field" type="search" />
      </form>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Link href="/preventivi" className={cn("chip", !sp.stato && "chip-active")}>
          Tutti
        </Link>
        {(Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).map((s) => (
          <Link key={s} href={`/preventivi?stato=${s}`} className={cn("chip", sp.stato === s && "chip-active")}>
            {QUOTATION_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>
      {quotations.length === 0 ? (
        <EmptyState title="Nessun preventivo" text="Crea un preventivo o aggiungi prodotti dalla scheda prodotto." />
      ) : (
        <div className="card divide-y divide-line">
          {quotations.map((q) => (
            <Link key={q.id} href={`/preventivi/${q.id}`} className="flex items-center gap-4 p-4 hover:bg-surface sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-soft">
                  {q.number} {q.id === user.activeQuotationId && <Badge className="ml-1">Attivo</Badge>}
                </p>
                <p className="truncate text-[17px]">{q.client?.name ?? "Senza cliente"}</p>
                <p className="truncate text-sm text-muted">
                  {q.title ?? `${q.items.length} articol${q.items.length === 1 ? "o" : "i"}`} · {fmtDate(q.updatedAt)} · {q.createdBy.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[17px]">{money(quotationTotals(q).total, q.currency)}</p>
                <Badge tone={tone[q.status]}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
