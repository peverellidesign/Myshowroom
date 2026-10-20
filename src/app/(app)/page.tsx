import Link from "next/link";
import { ArrowRight, Bookmark, CalendarPlus, FilePlus2, FileUp, Footprints, Search, Sofa, Store, UserPlus, Warehouse } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { searchProducts } from "@/lib/products";
import { APPOINTMENT_TYPE_LABELS, QUOTATION_STATUS_LABELS, fmtDate, fmtTime, money } from "@/lib/format";
import { quotationTotals } from "@/lib/quotations";
import { getSetting } from "@/lib/settings";
import { ProductCard, ProductImg } from "@/components/product-card";
import { cn } from "@/lib/utils";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("it-IT", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Zurich" }).format(new Date()));
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

function SectionTitle({ title, href, cta = "Vedi tutto" }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-[22px] font-light tracking-[-0.02em] text-ink sm:text-[26px]">{title}</h2>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-[13px] text-soft hover:text-ink">
          {cta} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ negato?: string }> }) {
  const user = await requireUser();
  const { negato } = await searchParams;
  await expireReservations();

  const [locations, exposed, warehouse, reserved, appointments, quotations, tasks, products, site] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.inventoryItem.aggregate({ where: { status: "ESPOSTO" }, _sum: { quantity: true } }),
    db.inventoryItem.aggregate({ where: { status: "DISPONIBILE", location: { type: "WAREHOUSE" } }, _sum: { quantity: true } }),
    db.reservation.aggregate({ where: { status: "ACTIVE" }, _sum: { quantity: true } }),
    can(user.role, "appointment:view")
      ? db.appointment.findMany({ where: { status: "CONFERMATO", startsAt: { gte: new Date() } }, include: { client: true, location: true }, orderBy: { startsAt: "asc" }, take: 3 })
      : [],
    can(user.role, "quote:view")
      ? db.quotation.findMany({ where: { status: { in: ["BOZZA", "INVIATO", "IN_TRATTATIVA"] } }, include: { client: true, items: true }, orderBy: { updatedAt: "desc" }, take: 3 })
      : [],
    db.task.findMany({
      where: { completed: false, OR: [{ assigneeId: user.id }, { assigneeId: null }] },
      include: { client: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 4,
    }),
    searchProducts({}),
    getSetting<{ heroImageKey?: string; heroCredit?: string }>("site", {}),
  ]);

  // Visual categories: count and a cover photo from the first product that has one.
  const categories = [...new Map(products.map((p) => [p.category, p])).keys()]
    .map((name) => {
      const items = products.filter((p) => p.category === name);
      return { name, count: items.length, cover: items.find((p) => p.image)?.image?.storageKey ?? null };
    })
    .sort((a, b) => b.count - a.count);

  const byShowroom = locations
    .filter((l) => l.type === "SHOWROOM")
    .map((l) => ({ location: l, items: products.filter((p) => p.locations.some((x) => x.id === l.id) && p.statuses.includes("ESPOSTO")) }))
    .filter((g) => g.items.length > 0);
  const bestDeals = [...products]
    .filter((p) => p.price?.list)
    .sort((a, b) => (1 - b.price!.v / b.price!.list!) - (1 - a.price!.v / a.price!.list!))
    .slice(0, 10);

  const quick = [
    { href: "/prodotti", label: "Cerca", icon: Search, show: true },
    { href: "/clienti?visita=1", label: "Visita", icon: Footprints, show: can(user.role, "client:edit") },
    { href: "/preventivi/nuovo", label: "Preventivo", icon: FilePlus2, show: can(user.role, "quote:edit") },
    { href: "/clienti?nuovo=1", label: "Cliente", icon: UserPlus, show: can(user.role, "client:edit") },
    { href: "/agenda?nuovo=1", label: "Appuntamento", icon: CalendarPlus, show: can(user.role, "appointment:edit") },
    { href: "/stock", label: "Showroom", icon: Store, show: true },
    { href: "/documenti?carica=1", label: "Catalogo", icon: FileUp, show: can(user.role, "document:manage") },
  ].filter((q) => q.show);

  const firstName = user.name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich" });

  return (
    <div className="animate-fadein">
      {/* Hero */}
      <section className="bleed relative lg:mx-0">
        <div className="relative h-[68svh] max-h-[620px] min-h-[440px] overflow-hidden bg-[#2a2826] lg:h-auto lg:min-h-0 lg:rounded-[28px] lg:pb-[40%]">
          {site.heroImageKey && <img src={`/api/files/${site.heroImageKey}`} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/5 to-black/70" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-7 sm:px-8 sm:pb-9 lg:px-10 lg:pb-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/75">Your showroom, everywhere.</p>
            <h1 className="mt-2 max-w-xl text-[40px] font-light leading-[1.02] tracking-[-0.03em] text-white sm:text-[54px]">Tutto a portata di mano.</h1>
            <p className="mt-2 max-w-md text-[16px] text-white/80 sm:text-[17px]">Prodotti, disponibilità e persone. In un unico spazio.</p>
            <form action="/prodotti" className="mt-5 flex max-w-xl items-center gap-2 rounded-full bg-white/95 p-1.5 pl-5 shadow-2xl backdrop-blur">
              <Search size={18} className="shrink-0 text-soft" />
              <input name="q" placeholder="Prodotto, brand, categoria…" className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-ink outline-none placeholder:text-muted" aria-label="Cerca nel tuo inventario" />
              <button className="pressable rounded-full bg-charcoal px-5 py-2.5 text-[14px] text-white">Cerca</button>
            </form>
          </div>
          {site.heroCredit && <span className="absolute right-4 top-[calc(env(safe-area-inset-top)+72px)] rounded-full bg-black/25 px-2.5 py-1 text-[10.5px] text-white/80 backdrop-blur lg:top-4">{site.heroCredit}</span>}
        </div>
      </section>

      {negato && <div className="mt-5 rounded-2xl bg-white px-5 py-3 text-sm text-soft shadow-soft">Non hai i permessi per accedere a quella sezione.</div>}

      <section className="mt-7 flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] capitalize text-muted">{today}</p>
          <p className="text-[26px] font-light tracking-[-0.02em] sm:text-[30px]">
            {greeting()}, {firstName}.
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-5">
        <div className="snap-row !gap-4 pb-1 lg:flex-wrap">
          {quick.map((q) => (
            <Link key={q.href} href={q.href} className="pressable flex w-[68px] flex-col items-center gap-2 text-center">
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-ink shadow-soft">
                <q.icon size={22} strokeWidth={1.5} />
              </span>
              <span className="text-[12px] leading-tight text-soft">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { label: "Esposti", value: exposed._sum.quantity ?? 0, icon: Sofa, href: "/stock?stato=ESPOSTO" },
          { label: "In magazzino", value: warehouse._sum.quantity ?? 0, icon: Warehouse, href: "/stock?tipo=WAREHOUSE" },
          { label: "Riservati", value: reserved._sum.quantity ?? 0, icon: Bookmark, href: "/stock?stato=RISERVATO" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="pressable rounded-[20px] bg-white p-4 shadow-soft">
            <s.icon size={18} strokeWidth={1.4} className="text-muted" />
            <p className="mt-3 text-[30px] font-light leading-none tracking-tight tabular-nums sm:text-[36px]">{s.value}</p>
            <p className="mt-1 text-[12.5px] text-soft">{s.label}</p>
          </Link>
        ))}
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Categorie" href="/prodotti" cta="Tutti i prodotti" />
          <div className="snap-row">
            {categories.map((c) => (
              <Link key={c.name} href={`/prodotti?q=${encodeURIComponent(c.name)}`} className="pressable relative h-[180px] w-[140px] overflow-hidden rounded-[20px] bg-[#EFEDE8] sm:h-[200px] sm:w-[160px]">
                <ProductImg storageKey={c.cover} alt="" cover className="absolute inset-0 h-full w-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-[15px] text-white">{c.name}</p>
                  <p className="text-[12px] text-white/70">{c.count} modell{c.count === 1 ? "o" : "i"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Best opportunities */}
      {bestDeals.length > 0 && (
        <section className="mt-10">
          <SectionTitle title="Le migliori opportunità" href="/prodotti?ordina=prezzo-asc" />
          <div className="snap-row">
            {bestDeals.map((p) => (
              <ProductCard key={p.id} p={p} width="w-[46vw] max-w-[230px] sm:w-[220px]" />
            ))}
          </div>
        </section>
      )}

      {/* By showroom */}
      {byShowroom.map((g) => (
        <section key={g.location.id} className="mt-10">
          <SectionTitle title={`In esposizione a ${g.location.name}`} href={`/stock?sede=${g.location.id}`} />
          <div className="snap-row">
            {g.items.slice(0, 12).map((p) => (
              <ProductCard key={p.id} p={p} width="w-[46vw] max-w-[230px] sm:w-[220px]" />
            ))}
          </div>
        </section>
      ))}

      {/* Today */}
      <div className="mt-10 grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        {can(user.role, "appointment:view") && (
          <section>
            <SectionTitle title="Prossimi appuntamenti" href="/agenda" cta="Agenda" />
            <div className="space-y-2.5">
              {appointments.length === 0 && <p className="rounded-[20px] bg-white p-5 text-sm text-soft shadow-soft">Nessun appuntamento in programma.</p>}
              {appointments.map((a) => (
                <Link key={a.id} href={`/agenda?giorno=${a.startsAt.toISOString().slice(0, 10)}`} className="pressable flex items-center gap-4 rounded-[20px] bg-white p-4 shadow-soft">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-selected">
                    <span className="text-[10px] uppercase tracking-wider text-muted">{fmtDate(a.startsAt, { day: undefined, year: undefined, month: "short" })}</span>
                    <span className="text-[20px] font-light leading-none">{new Date(a.startsAt).toLocaleDateString("it-IT", { day: "numeric", timeZone: "Europe/Zurich" })}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px]">{a.client?.name ?? "Cliente"}</p>
                    <p className="truncate text-[13px] text-soft">
                      {fmtTime(a.startsAt)} · {a.location.name} · {APPOINTMENT_TYPE_LABELS[a.type]}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        {can(user.role, "quote:view") && (
          <section>
            <SectionTitle title="Preventivi aperti" href="/preventivi" cta="Tutti" />
            <div className="space-y-2.5">
              {quotations.length === 0 && <p className="rounded-[20px] bg-white p-5 text-sm text-soft shadow-soft">Nessun preventivo aperto.</p>}
              {quotations.map((q) => (
                <Link key={q.id} href={`/preventivi/${q.id}`} className="pressable flex items-center justify-between gap-3 rounded-[20px] bg-white p-4 shadow-soft">
                  <div className="min-w-0">
                    <p className="truncate text-[15px]">{q.client?.name ?? "Senza cliente"}</p>
                    <p className="text-[13px] text-soft">
                      {q.number} · {QUOTATION_STATUS_LABELS[q.status]}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] tabular-nums">{money(quotationTotals(q).total, q.currency)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section>
          <SectionTitle title="Promemoria" href="/attivita" cta="Attività" />
          <div className="space-y-2.5">
            {tasks.length === 0 && <p className="rounded-[20px] bg-white p-5 text-sm text-soft shadow-soft">Niente in sospeso.</p>}
            {tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < new Date();
              return (
                <Link key={t.id} href="/attivita" className="pressable flex items-start gap-3 rounded-[20px] bg-white p-4 shadow-soft">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.priority === "ALTA" ? "bg-[#B5523F]" : "bg-[#C9C6BF]")} />
                  <div className="min-w-0">
                    <p className="text-[15px]">{t.title}</p>
                    <p className={cn("text-[13px]", overdue ? "text-[#8E2F2F]" : "text-soft")}>
                      {t.dueDate ? `Scadenza ${fmtDate(t.dueDate)}` : "Senza scadenza"}
                      {t.client && ` · ${t.client.name}`}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
