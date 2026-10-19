import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, FilePlus2, Footprints, Mail, Pencil, Phone, Plus, Send, Trash2, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { quotationTotals } from "@/lib/quotations";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS, QUOTATION_STATUS_LABELS, fmtDate, fmtDateTime, money } from "@/lib/format";
import { ClientForm } from "@/components/client-form";
import { VisitForm } from "@/components/visit-form";
import { ProductPicker } from "@/components/product-picker";
import { ProductImg } from "@/components/product-card";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, KeyValue } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { addInterests, createFollowUp, deleteClient, removeInterest, updateClient } from "../actions";
import { createQuotation } from "../../preventivi/actions";
import { release } from "../../stock/actions";
import { toggleTask } from "../../attivita/actions";

export const metadata = { title: "Cliente" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("client:view");
  const { id } = await params;
  await expireReservations();
  const client = await db.client.findUnique({
    where: { id },
    include: {
      preferredLocation: true,
      consultant: true,
      interests: { include: { productModel: { include: { brand: true, images: { where: { isMain: true }, take: 1 } } } } },
      visits: { include: { location: true, consultant: true, products: { include: { productModel: true } }, quotations: true }, orderBy: { date: "desc" } },
      appointments: { include: { location: true, consultant: true }, orderBy: { startsAt: "desc" } },
      quotations: { include: { items: true }, orderBy: { createdAt: "desc" } },
      reservations: { include: { inventoryItem: { include: { productModel: true, location: true } } }, orderBy: { createdAt: "desc" } },
      tasks: { include: { assignee: true }, orderBy: [{ completed: "asc" }, { dueDate: "asc" }] },
      emails: { include: { createdBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();
  const canEdit = can(user.role, "client:edit");
  const [locations, consultants, products] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true, roleKey: { in: ["SALES", "MANAGER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.productModel.findMany({ where: { active: true }, include: { brand: true }, orderBy: { name: "asc" } }),
  ]);
  const picker = products.map((p) => ({ id: p.id, name: p.name, brand: p.brand.name }));
  const now = new Date();

  return (
    <div className="animate-fadein">
      <Link href="/clienti" className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Clienti
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{client.company ?? "Cliente"}</p>
          <h1 className="h-display mt-1 flex items-center gap-3">
            {client.name} {client.isDemo && <DemoBadge />}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-soft">
            {client.email ? (
              <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-ink">
                <Mail size={15} /> {client.email}
              </a>
            ) : (
              <span>Email non inserita</span>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 hover:text-ink">
                <Phone size={15} /> {client.phone}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user.role, "email:send") && (
            <Link href={`/email/nuova?cliente=${client.id}&modello=preventivo`} className={buttonClass("primary", "sm")}>
              <Send size={14} /> Invia proposta
            </Link>
          )}
          {can(user.role, "appointment:edit") && (
            <Link href={`/agenda?nuovo=1&cliente=${client.id}`} className={buttonClass("secondary", "sm")}>
              <CalendarPlus size={14} /> Appuntamento
            </Link>
          )}
          {canEdit && (
            <ModalButton label={<><Footprints size={14} /> Visita</>} title="Registra visita showroom" className={buttonClass("secondary", "sm")} wide>
              <VisitForm clients={[]} locations={locations.filter((l) => l.type === "SHOWROOM")} consultants={consultants} products={picker} defaultClientId={client.id} defaultLocationId={client.preferredLocationId} />
            </ModalButton>
          )}
          {can(user.role, "quote:edit") && (
            <ActionForm action={createQuotation} redirectPattern="/preventivi/{id}">
              <input type="hidden" name="clientId" value={client.id} />
              <SubmitButton variant="secondary" size="sm">
                <FilePlus2 size={14} /> Preventivo
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <div className="card px-5 py-2">
            <KeyValue
              items={[
                ["Showroom preferito", client.preferredLocation?.name],
                ["Consulente", client.consultant?.name],
                ["Città", client.city],
                ["Cliente dal", fmtDate(client.createdAt)],
              ]}
            />
          </div>
          {client.notes && <p className="whitespace-pre-line rounded-2xl bg-selected px-4 py-3 text-sm text-soft">{client.notes}</p>}
          {canEdit && (
            <div className="flex gap-2">
              <ModalButton label={<><Pencil size={14} /> Modifica</>} title="Modifica cliente" className={buttonClass("secondary", "sm", "flex-1")}>
                <ClientForm action={updateClient.bind(null, client.id)} locations={locations} consultants={consultants} values={{ name: client.name, email: client.email, phone: client.phone, company: client.company, city: client.city, preferredLocationId: client.preferredLocationId, consultantId: client.consultantId, notes: client.notes }} />
              </ModalButton>
              <ActionButton action={deleteClient.bind(null, client.id)} variant="danger" confirm="Eliminare definitivamente il cliente e il suo storico?" redirectTo="/clienti">
                <Trash2 size={14} />
              </ActionButton>
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="eyebrow">Prodotti di interesse</h2>
              {canEdit && (
                <ModalButton label="+ Aggiungi" title="Prodotti di interesse" className="text-sm link-quiet">
                  <ActionForm action={addInterests.bind(null, client.id)} className="space-y-4">
                    <ProductPicker products={picker.filter((p) => !client.interests.some((i) => i.productModelId === p.id))} withStartPage={false} />
                    <SubmitButton className="w-full">Aggiungi</SubmitButton>
                  </ActionForm>
                </ModalButton>
              )}
            </div>
            <div className="card divide-y divide-line">
              {client.interests.length === 0 && <p className="p-4 text-sm text-soft">Nessun prodotto.</p>}
              {client.interests.map((i) => (
                <div key={i.productModelId} className="flex items-center gap-3 p-3">
                  <ProductImg storageKey={i.productModel.images[0]?.storageKey} alt={i.productModel.name} className="h-12 w-14 shrink-0 rounded-lg bg-[#F7F7F5]" />
                  <Link href={`/prodotti/${i.productModelId}`} className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{i.productModel.name}</p>
                    <p className="text-xs text-muted">{i.productModel.brand.name}</p>
                  </Link>
                  {canEdit && (
                    <ActionButton action={removeInterest.bind(null, client.id, i.productModelId)} variant="ghost" size="icon" title="Rimuovi">
                      <X size={14} />
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>

        <div className="space-y-8">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="eyebrow">Attività e follow-up</h2>
              {can(user.role, "task:edit") && (
                <ModalButton label="+ Follow-up" title="Nuovo follow-up" className="text-sm link-quiet">
                  <ActionForm action={createFollowUp.bind(null, client.id)} className="space-y-3">
                    <input name="title" placeholder="Es. Richiamare cliente" className="field" required />
                    <input name="dueDate" type="date" className="field" />
                    <SubmitButton className="w-full">Crea</SubmitButton>
                  </ActionForm>
                </ModalButton>
              )}
            </div>
            <div className="card divide-y divide-line">
              {client.tasks.length === 0 && <p className="p-4 text-sm text-soft">Nessuna attività.</p>}
              {client.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3.5">
                  <ActionButton action={toggleTask.bind(null, t.id)} variant="ghost" size="icon" title={t.completed ? "Riapri" : "Completa"}>
                    <span className={`h-5 w-5 rounded-full border ${t.completed ? "border-charcoal bg-charcoal" : "border-[#bbb]"}`} />
                  </ActionButton>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] ${t.completed ? "text-muted line-through" : ""}`}>{t.title}</p>
                    <p className={`text-xs ${!t.completed && t.dueDate && t.dueDate < now ? "text-[#8E2F2F]" : "text-muted"}`}>
                      {t.dueDate ? fmtDate(t.dueDate) : "Senza scadenza"} {t.assignee && `· ${t.assignee.name}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="eyebrow mb-2">Visite showroom</h2>
            <div className="card divide-y divide-line">
              {client.visits.length === 0 && <p className="p-4 text-sm text-soft">Nessuna visita registrata.</p>}
              {client.visits.map((v) => (
                <div key={v.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[15px]">
                      {fmtDateTime(v.date)} · {v.location.name}
                    </p>
                    {can(user.role, "quote:edit") && (
                      <ActionForm action={createQuotation} redirectPattern="/preventivi/{id}">
                        <input type="hidden" name="clientId" value={client.id} />
                        <input type="hidden" name="visitId" value={v.id} />
                        <SubmitButton variant="ghost" size="sm">
                          <Plus size={13} /> Genera preventivo
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                  <p className="text-sm text-soft">
                    {[v.consultant?.name, v.projectType, v.budget && `Budget ${v.budget}`, v.timeline].filter(Boolean).join(" · ")}
                  </p>
                  {v.products.length > 0 && <p className="mt-1 text-sm">Visti: {v.products.map((p) => p.productModel.name).join(", ")}</p>}
                  {v.preferences && <p className="text-sm text-muted">Preferenze: {v.preferences}</p>}
                  {v.notes && <p className="text-sm text-muted">{v.notes}</p>}
                  {v.nextAction && <p className="mt-1 text-sm">→ {v.nextAction}</p>}
                  {v.quotations.length > 0 && <p className="mt-1 text-xs text-muted">Preventivi: {v.quotations.map((q) => q.number).join(", ")}</p>}
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-2">
            <section>
              <h2 className="eyebrow mb-2">Preventivi</h2>
              <div className="card divide-y divide-line">
                {client.quotations.length === 0 && <p className="p-4 text-sm text-soft">Nessun preventivo.</p>}
                {client.quotations.map((q) => (
                  <Link key={q.id} href={`/preventivi/${q.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-[#FCFCFB]">
                    <div>
                      <p className="text-[15px]">{q.number}</p>
                      <p className="text-xs text-muted">{fmtDate(q.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[15px]">{money(quotationTotals(q).total, q.currency)}</p>
                      <Badge>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <h2 className="eyebrow mb-2">Prenotazioni</h2>
              <div className="card divide-y divide-line">
                {client.reservations.length === 0 && <p className="p-4 text-sm text-soft">Nessuna prenotazione.</p>}
                {client.reservations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                    <Link href={`/stock/${r.inventoryItemId}`} className="min-w-0">
                      <p className="truncate text-[15px]">{r.inventoryItem.productModel.name}</p>
                      <p className="text-xs text-muted">
                        {r.inventoryItem.location.name} · {r.status === "ACTIVE" ? `scade ${fmtDate(r.expiresAt)}` : r.status === "EXPIRED" ? "scaduta" : r.status === "CONVERTED" ? "venduto" : "rilasciata"}
                      </p>
                    </Link>
                    {r.status === "ACTIVE" && can(user.role, "inventory:reserve") && (
                      <ActionButton action={release.bind(null, r.id)} confirm="Rilasciare la prenotazione?">
                        Rilascia
                      </ActionButton>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="eyebrow mb-2">Appuntamenti</h2>
              <div className="card divide-y divide-line">
                {client.appointments.length === 0 && <p className="p-4 text-sm text-soft">Nessun appuntamento.</p>}
                {client.appointments.map((a) => (
                  <Link key={a.id} href={`/agenda?giorno=${a.startsAt.toISOString().slice(0, 10)}`} className="block p-4 hover:bg-[#FCFCFB]">
                    <p className="text-[15px]">
                      {fmtDateTime(a.startsAt)} · {a.location.name}
                    </p>
                    <p className="text-xs text-muted">
                      {APPOINTMENT_TYPE_LABELS[a.type]} · {APPOINTMENT_STATUS_LABELS[a.status]} {a.startsAt < now && a.status === "CONFERMATO" ? "· passato" : ""}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <h2 className="eyebrow mb-2">Comunicazioni</h2>
              <div className="card divide-y divide-line">
                {client.emails.length === 0 && <p className="p-4 text-sm text-soft">Nessuna email.</p>}
                {client.emails.map((e) => (
                  <Link key={e.id} href={`/email/${e.id}`} className="block p-4 hover:bg-[#FCFCFB]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[15px]">{e.subject}</p>
                      <Badge tone={e.status === "INVIATA" ? "success" : e.status === "ERRORE" ? "danger" : "neutral"}>
                        {e.status === "INVIATA" ? "Inviata" : e.status === "ERRORE" ? "Errore" : "Bozza"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {fmtDateTime(e.sentAt ?? e.createdAt)} · {e.createdBy.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
