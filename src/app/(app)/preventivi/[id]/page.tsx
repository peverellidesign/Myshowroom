import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, FileDown, GitBranch, Mail, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { QuotationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { lineTotal, quotationTotals } from "@/lib/quotations";
import { getExchangeRate } from "@/lib/settings";
import { AVAILABLE_STATUSES, QUOTATION_STATUS_LABELS, fmtDate, money, pct, toNum } from "@/lib/format";
import { AddItemForm, ClientSelect, CopyQuote } from "@/components/quote-widgets";
import { ProductImg } from "@/components/product-card";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addCustomItem,
  deleteQuotation,
  duplicateQuotation,
  removeItem,
  reviseQuotation,
  setActiveQuotation,
  setQuotationCurrency,
  setQuotationStatus,
  updateItem,
  updateQuotation,
} from "../actions";

export const metadata = { title: "Preventivo" };

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("quote:view");
  const { id } = await params;
  const q = await db.quotation.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: true,
      items: {
        orderBy: { sortOrder: "asc" },
        include: { productModel: { include: { images: { where: { isMain: true }, take: 1 } } }, inventoryItem: { include: { location: true } } },
      },
      parent: true,
      revisions: { orderBy: { revision: "asc" } },
      emails: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!q) notFound();
  const canEdit = can(user.role, "quote:edit");
  const closed = q.status === "ACCETTATO" || q.status === "RIFIUTATO";
  const editable = canEdit && !closed;
  const [clients, products, rate, siblings] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    editable
      ? db.productModel.findMany({
          where: { active: true },
          include: { brand: true, configurations: { orderBy: { sortOrder: "asc" } }, inventory: { where: { status: { in: AVAILABLE_STATUSES } }, include: { location: true } } },
          orderBy: { name: "asc" },
        })
      : [],
    getExchangeRate(),
    db.quotation.findMany({ where: { OR: [{ id: q.parentId ?? q.id }, { parentId: q.parentId ?? q.id }] }, orderBy: { revision: "asc" }, select: { id: true, number: true, revision: true, status: true } }),
  ]);
  const t = quotationTotals(q);
  const statuses = Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[];
  const plain = [
    `Peverelli Design — Preventivo ${q.number}`,
    q.client ? `Cliente: ${q.client.name}` : "",
    "",
    ...q.items.map((i) => `${i.brandName} ${i.modelName}${i.configLabel ? ` (${i.configLabel})` : ""} × ${i.quantity} — ${money(lineTotal(i), q.currency)}`),
    "",
    `Totale indicativo: ${money(t.total, q.currency)}`,
  ].join("\n");

  return (
    <div className="mx-auto max-w-5xl animate-fadein">
      <Link href="/preventivi" className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Preventivi
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">
            {q.number} · creato {fmtDate(q.createdAt)} da {q.createdBy.name}
          </p>
          <h1 className="h-display mt-2">{q.title ?? "La proposta."}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={q.status === "ACCETTATO" ? "success" : q.status === "RIFIUTATO" ? "danger" : "neutral"}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
            {q.id === user.activeQuotationId && <Badge tone="dark">Preventivo attivo</Badge>}
            {q.revision > 0 && <Badge tone="outline">Revisione {q.revision}</Badge>}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {!closed && q.id !== user.activeQuotationId && (
              <ActionButton action={setActiveQuotation.bind(null, q.id)} title="I prodotti aggiunti dalle schede andranno qui">
                <Star size={14} /> Rendi attivo
              </ActionButton>
            )}
            <ActionButton action={duplicateQuotation.bind(null, q.id)} redirectTo="/preventivi/{id}">
              <Copy size={14} /> Duplica
            </ActionButton>
            <ActionButton action={reviseQuotation.bind(null, q.id)} redirectTo="/preventivi/{id}">
              <GitBranch size={14} /> Revisione
            </ActionButton>
            {q.status === "BOZZA" && (
              <ActionButton action={deleteQuotation.bind(null, q.id)} variant="danger" confirm="Eliminare questa bozza?" redirectTo="/preventivi">
                <Trash2 size={14} />
              </ActionButton>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-[15px]">Cliente</span>
              {canEdit ? <ClientSelect quotationId={q.id} clientId={q.clientId} clients={clients} disabled={!editable} /> : <p className="field">{q.client?.name ?? "—"}</p>}
            </label>
            <div className="flex items-center justify-between gap-6 sm:justify-end">
              <span className="text-[15px] text-soft sm:hidden">Valuta</span>
              <div className="flex gap-1 rounded-full bg-selected p-1">
                {(["CHF", "EUR"] as const).map((c) =>
                  editable && c !== q.currency ? (
                    <ActionButton key={c} action={setQuotationCurrency.bind(null, q.id, c)} variant="ghost" className="h-10 rounded-full px-5 text-soft">
                      {c}
                    </ActionButton>
                  ) : (
                    <span key={c} className={cn("flex h-10 items-center rounded-full px-5 text-[15px]", c === q.currency ? "bg-white shadow-sm" : "text-soft")}>
                      {c}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {q.items.length === 0 && <div className="card p-8 text-center text-sm text-soft">Nessun articolo. Aggiungi prodotti dalle schede o con «Aggiungi riga».</div>}
            {q.items.map((i) => (
              <div key={i.id} className="card flex gap-4 p-4 sm:p-5">
                <ProductImg storageKey={i.productModel?.images[0]?.storageKey} alt={i.modelName} className="hidden h-20 w-24 shrink-0 rounded-xl bg-[#F7F7F5] sm:flex" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-soft">{i.brandName}</p>
                  <p className="text-[19px] leading-tight">
                    {i.productModelId ? (
                      <Link href={`/prodotti/${i.productModelId}`} className="hover:underline">
                        {i.modelName}
                      </Link>
                    ) : (
                      i.modelName
                    )}
                  </p>
                  <p className="mt-1 text-sm text-soft">{[i.description, i.configLabel, i.materials].filter(Boolean).join(" · ")}</p>
                  {i.dimensions && <p className="text-xs text-muted">{i.dimensions}</p>}
                  <p className="mt-2 text-[15px]">
                    {i.quantity > 1 && `${i.quantity} × ${money(i.unitPrice, q.currency)} = `}
                    {toNum(i.discountPct) > 0 && <span className="mr-2 text-muted line-through">{money(toNum(i.unitPrice) * i.quantity, q.currency)}</span>}
                    {money(lineTotal(i), q.currency)}
                    {toNum(i.discountPct) > 0 && <span className="ml-2 text-sm text-soft">−{pct(i.discountPct)}</span>}
                  </p>
                </div>
                {editable && (
                  <div className="flex flex-col gap-1">
                    <ModalButton label={<Pencil size={16} />} title={`Modifica ${i.modelName}`} className="rounded-full p-2 text-soft hover:bg-selected">
                      <ActionForm action={updateItem.bind(null, i.id)} className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <label className="block">
                            <span className="label">Quantità</span>
                            <input name="quantity" type="number" min={1} defaultValue={i.quantity} className="field" />
                          </label>
                          <label className="block">
                            <span className="label">Prezzo unit. ({q.currency})</span>
                            <input name="unitPrice" type="number" min={0} step="0.01" defaultValue={toNum(i.unitPrice)} className="field" />
                          </label>
                          <label className="block">
                            <span className="label">Sconto %</span>
                            <input name="discountPct" type="number" min={0} max={100} step="any" defaultValue={toNum(i.discountPct)} className="field" />
                          </label>
                        </div>
                        <input name="description" defaultValue={i.description ?? ""} placeholder="Descrizione" className="field" />
                        <input name="configLabel" defaultValue={i.configLabel ?? ""} placeholder="Composizione" className="field" />
                        <input name="materials" defaultValue={i.materials ?? ""} placeholder="Materiali e finiture" className="field" />
                        <input name="dimensions" defaultValue={i.dimensions ?? ""} placeholder="Dimensioni" className="field" />
                        <SubmitButton className="w-full">Salva riga</SubmitButton>
                      </ActionForm>
                    </ModalButton>
                    <ActionButton action={removeItem.bind(null, i.id)} variant="ghost" size="icon" title="Rimuovi" confirm="Rimuovere la riga?">
                      <Trash2 size={16} />
                    </ActionButton>
                  </div>
                )}
              </div>
            ))}
            {editable && (
              <ModalButton label={<><Plus size={15} /> Aggiungi riga</>} title="Aggiungi riga" className={buttonClass("secondary", "md", "w-full")}>
                <AddItemForm
                  action={addCustomItem.bind(null, q.id)}
                  products={products.map((p) => ({
                    id: p.id,
                    label: `${p.brand.name} — ${p.name}`,
                    configurations: p.configurations.map((c) => ({ id: c.id, name: c.name })),
                    stock: p.inventory.map((s) => ({ id: s.id, label: `${s.location.name} · ${s.composition ?? ""} · ${s.materialsDescription ?? ""}` })),
                  }))}
                />
              </ModalButton>
            )}
          </div>

          {editable ? (
            <ActionForm action={updateQuotation.bind(null, q.id)} className="card space-y-4 p-5">
              <input type="hidden" name="clientId" value={q.clientId ?? ""} />
              <h2 className="eyebrow">Condizioni e servizi</h2>
              <input name="title" defaultValue={q.title ?? ""} placeholder="Titolo del preventivo" className="field" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="block">
                  <span className="label">Sconto globale %</span>
                  <input name="discountPct" type="number" min={0} max={100} step="any" defaultValue={toNum(q.discountPct)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Trasporto</span>
                  <input name="transportCost" type="number" min={0} step="0.01" defaultValue={toNum(q.transportCost)} className="field" />
                </label>
                <label className="block">
                  <span className="label">Montaggio</span>
                  <input name="installationCost" type="number" min={0} step="0.01" defaultValue={toNum(q.installationCost)} className="field" />
                </label>
                <label className="block">
                  <span className="label">IVA %</span>
                  <input name="vatPct" type="number" min={0} max={100} step="0.1" defaultValue={toNum(q.vatPct)} className="field" />
                </label>
              </div>
              <label className="block">
                <span className="label">Valido fino al</span>
                <input name="validUntil" type="date" defaultValue={q.validUntil?.toISOString().slice(0, 10) ?? ""} className="field" />
              </label>
              <textarea name="notes" defaultValue={q.notes ?? ""} placeholder="Note commerciali (tempi di consegna, condizioni di pagamento…)" rows={3} className="field" />
              <SubmitButton variant="secondary" className="w-full">
                Salva condizioni
              </SubmitButton>
            </ActionForm>
          ) : (
            q.notes && <p className="card whitespace-pre-line p-5 text-sm text-soft">{q.notes}</p>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="card p-5">
            <div className="space-y-2 text-[15px]">
              <Row label="Subtotale" value={money(t.subtotal, q.currency)} />
              {t.discount > 0 && <Row label={`Sconto ${pct(q.discountPct)}`} value={`− ${money(t.discount, q.currency)}`} />}
              {toNum(q.transportCost) > 0 && <Row label="Trasporto" value={money(q.transportCost, q.currency)} />}
              {toNum(q.installationCost) > 0 && <Row label="Montaggio" value={money(q.installationCost, q.currency)} />}
              {t.vat > 0 && <Row label={`IVA ${toNum(q.vatPct)}%`} value={money(t.vat, q.currency)} />}
            </div>
            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-[17px]">Totale indicativo</span>
              <span className="text-[28px] tracking-tight">{money(t.total, q.currency)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Cambio: 1 EUR = {toNum(q.exchangeRate ?? rate.eurToChf).toFixed(4)} CHF ({(q.exchangeSource ?? rate.source) === "BCE" ? "BCE verificato" : "manuale"})
            </p>
            <div className="mt-5 space-y-2">
              {can(user.role, "email:send") && (
                <Link href={`/email/nuova?preventivo=${q.id}`} className={buttonClass("primary", "md", "w-full")}>
                  <Mail size={16} /> Prepara email con preventivo
                </Link>
              )}
              <a href={`/api/quotations/${q.id}/pdf`} className={buttonClass("secondary", "md", "w-full")}>
                <FileDown size={16} /> Scarica PDF
              </a>
              <CopyQuote text={plain} />
            </div>
          </div>
          {canEdit && (
            <div className="card p-5">
              <p className="eyebrow mb-3">Stato</p>
              <div className="flex flex-wrap gap-2">
                {statuses.map((s) =>
                  s === q.status ? (
                    <span key={s} className="chip chip-active">
                      {QUOTATION_STATUS_LABELS[s]}
                    </span>
                  ) : (
                    <ActionButton key={s} action={setQuotationStatus.bind(null, q.id, s)} className="rounded-full">
                      {QUOTATION_STATUS_LABELS[s]}
                    </ActionButton>
                  ),
                )}
              </div>
            </div>
          )}
          {siblings.length > 1 && (
            <div className="card p-5">
              <p className="eyebrow mb-3">Revisioni</p>
              <div className="space-y-1">
                {siblings.map((s) => (
                  <Link key={s.id} href={`/preventivi/${s.id}`} className={cn("flex justify-between rounded-xl px-3 py-2 text-sm", s.id === q.id ? "bg-selected" : "hover:bg-selected")}>
                    <span>{s.number}</span>
                    <span className="text-soft">{QUOTATION_STATUS_LABELS[s.status]}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {q.emails.length > 0 && (
            <div className="card p-5">
              <p className="eyebrow mb-3">Email</p>
              {q.emails.map((e) => (
                <Link key={e.id} href={`/email/${e.id}`} className="flex justify-between gap-2 py-1 text-sm hover:underline">
                  <span className="truncate">{e.subject}</span>
                  <span className="shrink-0 text-soft">{e.status === "INVIATA" ? "Inviata" : e.status === "ERRORE" ? "Errore" : "Bozza"}</span>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-soft">{label}</span>
      <span>{value}</span>
    </div>
  );
}
