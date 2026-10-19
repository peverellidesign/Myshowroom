import Link from "next/link";
import { ArrowUpRight, Bookmark, CalendarPlus, FilePlus2, FileUp, Search, Sofa, Store, UserPlus, Warehouse } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { searchProducts } from "@/lib/products";
import { APPOINTMENT_TYPE_LABELS, QUOTATION_STATUS_LABELS, fmtDate, fmtDateTime, money, toNum } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { ProductCard } from "@/components/product-card";
import { Badge, Section, Stat } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ negato?: string }> }) {
  const user = await requireUser();
  const { negato } = await searchParams;
  await expireReservations();

  const since = new Date(Date.now() - 30 * 86400_000);
  const [locations, exposed, warehouse, reserved, recentCount, appointments, quotations, tasks, featured, recent, site] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.inventoryItem.aggregate({ where: { status: "ESPOSTO" }, _sum: { quantity: true } }),
    db.inventoryItem.aggregate({ where: { status: "DISPONIBILE", location: { type: "WAREHOUSE" } }, _sum: { quantity: true } }),
    db.reservation.aggregate({ where: { status: "ACTIVE" }, _sum: { quantity: true } }),
    db.inventoryItem.count({ where: { createdAt: { gte: since } } }),
    can(user.role, "appointment:view")
      ? db.appointment.findMany({
          where: { status: "CONFERMATO", startsAt: { gte: new Date() } },
          include: { client: true, location: true, consultant: true },
          orderBy: { startsAt: "asc" },
          take: 4,
        })
      : [],
    can(user.role, "quote:view")
      ? db.quotation.findMany({
          where: { status: { in: ["BOZZA", "INVIATO", "IN_TRATTATIVA"] } },
          include: { client: true, items: true },
          orderBy: { updatedAt: "desc" },
          take: 4,
        })
      : [],
    db.task.findMany({
      where: { completed: false, OR: [{ assigneeId: user.id }, { assigneeId: null }] },
      include: { client: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 5,
    }),
    searchProducts({ availability: "esposto" }),
    searchProducts({ sort: "recenti" }),
    getSetting<{ heroImageKey?: string; heroCredit?: string }>("site", {}),
  ]);

  const quick = [
    { href: "/prodotti", label: "Cerca prodotto", icon: Search, show: true },
    { href: "/stock", label: "Esplora showroom", icon: Store, show: true },
    { href: "/preventivi/nuovo", label: "Nuovo preventivo", icon: FilePlus2, show: can(user.role, "quote:edit") },
    { href: "/clienti?nuovo=1", label: "Nuovo cliente", icon: UserPlus, show: can(user.role, "client:edit") },
    { href: "/agenda?nuovo=1", label: "Prenota appuntamento", icon: CalendarPlus, show: can(user.role, "appointment:edit") },
    { href: "/documenti?carica=1", label: "Carica catalogo", icon: FileUp, show: can(user.role, "document:manage") },
  ].filter((q) => q.show);

  return (
    <div className="animate-fadein">
      {negato && (
        <div className="mb-4 rounded-2xl border border-line bg-white px-5 py-3 text-sm text-soft">
          Non hai i permessi per accedere a quella sezione.
        </div>
      )}

      {/* Hero */}
      <section className="-mx-4 -mt-6 sm:-mx-6 lg:mx-0 lg:mt-0">
        <div className="relative aspect-[16/10] overflow-hidden bg-[#E9E6E0] sm:aspect-[16/8] lg:aspect-[16/7] lg:rounded-2xl">
          {site.heroImageKey && <img src={`/api/files/${site.heroImageKey}`} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          {site.heroCredit && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/35 px-3 py-1 text-xs text-white backdrop-blur">{site.heroCredit}</span>
          )}
        </div>
      </section>

      <section className="mt-6 lg:mt-8">
        <p className="eyebrow">Your showroom, everywhere.</p>
        <h1 className="h-display mt-2">Tutto a portata di mano.</h1>
        <p className="mt-2 text-[17px] text-soft">Prodotti, disponibilità e persone. In un unico spazio.</p>

        <form action="/prodotti" className="card mt-6 p-5">
          <label className="eyebrow mb-3 block" htmlFor="home-q">
            Cerca nel tuo inventario
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input id="home-q" name="q" placeholder="Prodotto, brand, categoria…" className="field flex-1" />
            <button className={buttonClass("primary", "md", "sm:w-auto")}>
              Esplora i prodotti <ArrowUpRight size={17} />
            </button>
          </div>
        </form>
      </section>

      <Section title="Showroom" className="mt-8">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {locations.map((l) => (
            <Link key={l.id} href={`/stock?sede=${l.id}`} className="chip">
              {l.type === "WAREHOUSE" ? <Warehouse size={14} /> : <Store size={14} />}
              {l.name}
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Prodotti esposti" value={String(exposed._sum.quantity ?? 0).padStart(2, "0")} icon={<Sofa size={20} strokeWidth={1.4} />} href="/stock?stato=ESPOSTO" />
          <Stat label="Disponibili in magazzino" value={String(warehouse._sum.quantity ?? 0).padStart(2, "0")} icon={<Warehouse size={20} strokeWidth={1.4} />} href="/stock?tipo=WAREHOUSE" />
          <Stat label="Riservati" value={String(reserved._sum.quantity ?? 0).padStart(2, "0")} icon={<Bookmark size={20} strokeWidth={1.4} />} href="/stock?stato=RISERVATO" />
          <Stat label="Nuovi arrivi (30 gg)" value={String(recentCount).padStart(2, "0")} icon={<Store size={20} strokeWidth={1.4} />} href="/prodotti?ordina=recenti" />
        </div>
      </Section>

      <Section title="Azioni rapide">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="card flex flex-col gap-4 p-4 text-[15px] transition hover:border-ink/25">
              <q.icon size={20} strokeWidth={1.4} className="text-soft" />
              {q.label}
            </Link>
          ))}
        </div>
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-3">
        {can(user.role, "appointment:view") && (
          <Section title="Prossimi appuntamenti" action={<Link href="/agenda" className="text-sm text-soft link-quiet">Agenda</Link>}>
            <div className="card divide-y divide-line">
              {appointments.length === 0 && <p className="p-5 text-sm text-soft">Nessun appuntamento in programma.</p>}
              {appointments.map((a) => (
                <Link key={a.id} href={`/agenda?giorno=${a.startsAt.toISOString().slice(0, 10)}`} className="block p-4 hover:bg-[#FCFCFB]">
                  <div className="text-sm text-soft">{fmtDateTime(a.startsAt)} · {a.location.name}</div>
                  <div className="text-[15px] text-ink">{a.client?.name ?? "Cliente"}</div>
                  <div className="text-sm text-muted">{APPOINTMENT_TYPE_LABELS[a.type]}</div>
                </Link>
              ))}
            </div>
          </Section>
        )}
        {can(user.role, "quote:view") && (
          <Section title="Preventivi aperti" action={<Link href="/preventivi" className="text-sm text-soft link-quiet">Tutti</Link>}>
            <div className="card divide-y divide-line">
              {quotations.length === 0 && <p className="p-5 text-sm text-soft">Nessun preventivo aperto.</p>}
              {quotations.map((q) => {
                const total = q.items.reduce((s, i) => s + toNum(i.unitPrice) * i.quantity * (1 - toNum(i.discountPct) / 100), 0);
                return (
                  <Link key={q.id} href={`/preventivi/${q.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-[#FCFCFB]">
                    <div className="min-w-0">
                      <div className="text-sm text-soft">{q.number}</div>
                      <div className="truncate text-[15px]">{q.client?.name ?? "Senza cliente"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[15px]">{money(total, q.currency)}</div>
                      <Badge tone={q.status === "BOZZA" ? "neutral" : "warning"}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}
        <Section title="Promemoria" action={<Link href="/attivita" className="text-sm text-soft link-quiet">Attività</Link>}>
          <div className="card divide-y divide-line">
            {tasks.length === 0 && <p className="p-5 text-sm text-soft">Niente in sospeso. Ottimo lavoro.</p>}
            {tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < new Date();
              return (
                <Link key={t.id} href="/attivita" className="block p-4 hover:bg-[#FCFCFB]">
                  <div className="text-[15px]">{t.title}</div>
                  <div className={cn("text-sm", overdue ? "text-[#8E2F2F]" : "text-muted")}>
                    {t.dueDate ? `Scadenza ${fmtDate(t.dueDate)}` : "Senza scadenza"}
                    {t.client && ` · ${t.client.name}`}
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      </div>

      <Section title="In esposizione" action={<Link href="/prodotti?disponibilita=esposto" className="text-sm text-soft link-quiet">Vedi tutti</Link>}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {featured.slice(0, 4).map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </Section>

      <Section title="Aggiunti di recente">
        <div className="grid gap-3 lg:grid-cols-2">
          {recent.slice(0, 4).map((p) => (
            <ProductCard key={p.id} p={p} compact />
          ))}
        </div>
      </Section>
    </div>
  );
}
