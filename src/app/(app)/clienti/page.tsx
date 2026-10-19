import Link from "next/link";
import { CalendarPlus, CircleCheck, Footprints, Send, UserRound } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ClientForm } from "@/components/client-form";
import { VisitForm } from "@/components/visit-form";
import { ModalButton } from "@/components/ui/modal";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "./actions";

export const metadata = { title: "Clienti" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; nuovo?: string; visita?: string; miei?: string }> }) {
  const user = await requireUser("client:view");
  const sp = await searchParams;
  const where: Prisma.ClientWhereInput = {};
  if (sp.q) where.OR = ["name", "email", "phone", "company", "city"].map((f) => ({ [f]: { contains: sp.q, mode: "insensitive" } }));
  if (sp.miei) where.consultantId = user.id;
  const canEdit = can(user.role, "client:edit");
  const [clients, locations, consultants, products] = await Promise.all([
    db.client.findMany({
      where,
      include: {
        preferredLocation: true,
        consultant: true,
        visits: { orderBy: { date: "desc" }, take: 1, include: { location: true } },
        _count: { select: { quotations: true, reservations: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true, roleKey: { in: ["SALES", "MANAGER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.productModel.findMany({ where: { active: true }, include: { brand: true }, orderBy: { name: "asc" } }),
  ]);
  const pickerProducts = products.map((p) => ({ id: p.id, name: p.name, brand: p.brand.name }));

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="03 / Client relationships"
        title="Le persone."
        subtitle="Ogni visita è l'inizio di una relazione."
        actions={
          canEdit && (
            <ModalButton
              label={<><Footprints size={15} /> Registra visita showroom</>}
              title="Registra visita showroom"
              className={buttonClass("primary", "sm")}
              wide
              defaultOpen={sp.visita === "1"}
            >
              <VisitForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} locations={locations.filter((l) => l.type === "SHOWROOM")} consultants={consultants} products={pickerProducts} defaultLocationId={user.defaultLocationId} />
            </ModalButton>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
        {canEdit && (
          <div className="card h-fit p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="mb-4 text-xl">Registra un nuovo cliente</h2>
            <ClientForm action={createClient} locations={locations} consultants={consultants} products={pickerProducts} isNew />
          </div>
        )}
        <div className={canEdit ? "" : "lg:col-span-2"}>
          <form className="mb-3 flex gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Cerca per nome, email, telefono, città…" className="field" type="search" />
          </form>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="eyebrow">Clienti registrati · {clients.length}</h2>
            <Link href={sp.miei ? "/clienti" : "/clienti?miei=1"} className="text-sm text-soft link-quiet">
              {sp.miei ? "Tutti i clienti" : "Solo i miei"}
            </Link>
          </div>
          {clients.length === 0 ? (
            <EmptyState title="Nessun cliente" text="Registra il primo cliente o una visita in showroom." />
          ) : (
            <div className="space-y-3">
              {clients.map((c) => (
                <div key={c.id} className="card p-4 sm:p-5">
                  <Link href={`/clienti/${c.id}`} className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-selected">
                      <UserRound size={20} strokeWidth={1.4} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[19px] leading-tight">{c.name}</p>
                      <p className="truncate text-sm text-soft">{[c.email ?? "Email non inserita", c.phone].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 text-sm text-muted">
                        {c.visits[0] ? `Ultima visita ${c.visits[0].location.name}` : c.preferredLocation ? `Showroom ${c.preferredLocation.name}` : "Nessuna visita"}
                        {c.consultant && ` · ${c.consultant.name}`}
                        {c._count.quotations > 0 && ` · ${c._count.quotations} preventiv${c._count.quotations === 1 ? "o" : "i"}`}
                        {c._count.reservations > 0 && ` · ${c._count.reservations} riserv.`}
                      </p>
                    </div>
                    {c.consultantId === user.id && <CircleCheck size={20} strokeWidth={1.3} className="shrink-0 text-soft" aria-label="Tuo cliente" />}
                  </Link>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {can(user.role, "email:send") && (
                      <Link href={`/email/nuova?cliente=${c.id}&modello=preventivo`} className={buttonClass("primary", "sm")}>
                        <Send size={14} /> Invia proposta
                      </Link>
                    )}
                    {can(user.role, "appointment:edit") && (
                      <Link href={`/agenda?nuovo=1&cliente=${c.id}`} className={buttonClass("secondary", "sm")}>
                        <CalendarPlus size={14} /> Appuntamento
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
