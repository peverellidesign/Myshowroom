import Link from "next/link";
import { Plus, Store, Warehouse } from "lucide-react";
import type { InventoryStatus, LocationType, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { INVENTORY_STATUS_LABELS, money, netPrice } from "@/lib/format";
import { ProductImg, StatusPill, photoRatio } from "@/components/product-card";
import { DemoBadge, EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Showroom & Stock" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ sede?: string; stato?: string; tipo?: string; q?: string }> }) {
  const user = await requireUser("inventory:view");
  const sp = await searchParams;
  await expireReservations();

  const where: Prisma.InventoryItemWhereInput = { status: sp.stato ? (sp.stato as InventoryStatus) : { not: "VENDUTO" } };
  if (sp.sede) where.locationId = sp.sede;
  if (sp.tipo) where.location = { type: sp.tipo as LocationType };
  if (sp.q)
    where.OR = [
      { code: { contains: sp.q, mode: "insensitive" } },
      { productModel: { name: { contains: sp.q, mode: "insensitive" } } },
      { productModel: { brand: { name: { contains: sp.q, mode: "insensitive" } } } },
      { materialsDescription: { contains: sp.q, mode: "insensitive" } },
    ];

  const [locations, counts, items] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.inventoryItem.groupBy({ by: ["locationId"], where: { status: { not: "VENDUTO" } }, _sum: { quantity: true } }),
    db.inventoryItem.findMany({
      where,
      include: {
        productModel: { include: { brand: true, images: { where: { isMain: true }, take: 1 } } },
        location: true,
        zone: true,
        transferTo: true,
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        reservations: { where: { status: "ACTIVE" }, include: { client: true } },
      },
      orderBy: [{ location: { sortOrder: "asc" } }, { zone: { name: "asc" } }, { productModel: { name: "asc" } }],
    }),
  ]);
  const countFor = (id: string) => counts.find((c) => c.locationId === id)?._sum.quantity ?? 0;
  const groups = locations.map((l) => ({ location: l, items: items.filter((i) => i.locationId === l.id) })).filter((g) => g.items.length);

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/stock?${s}` : "/stock";
  };

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="02 / Showroom & stock"
        title="Gli spazi."
        subtitle="Ogni pezzo, esattamente dove si trova."
        actions={
          can(user.role, "inventory:edit") && (
            <LinkButton href={`/stock/nuovo${sp.sede ? `?sede=${sp.sede}` : ""}`} size="sm">
              <Plus size={15} /> Nuovo pezzo
            </LinkButton>
          )
        }
      />

      <div className="no-scrollbar -mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
        {locations.map((l) => (
          <Link
            key={l.id}
            href={qs({ sede: sp.sede === l.id ? null : l.id, tipo: null })}
            className={cn("pressable min-w-[150px] rounded-[20px] bg-white p-4 shadow-soft", sp.sede === l.id && "ring-1 ring-ink")}
          >
            <div className="flex items-center justify-between text-soft">
              {l.type === "WAREHOUSE" ? <Warehouse size={18} strokeWidth={1.4} /> : <Store size={18} strokeWidth={1.4} />}
              <span className="text-2xl font-normal text-charcoal">{String(countFor(l.id)).padStart(2, "0")}</span>
            </div>
            <p className="mt-4 text-[15px]">{l.name}</p>
            <p className="text-xs text-muted">{l.type === "WAREHOUSE" ? "Magazzino" : "Showroom"} · {l.city}</p>
          </Link>
        ))}
      </div>

      <form className="mb-3" action="/stock">
        {sp.sede && <input type="hidden" name="sede" value={sp.sede} />}
        {sp.stato && <input type="hidden" name="stato" value={sp.stato} />}
        <input name="q" defaultValue={sp.q} placeholder="Cerca per codice, modello, brand, finitura…" className="field" type="search" />
      </form>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={qs({ stato: null })} className={cn("chip", !sp.stato && "chip-active")}>
          Tutti
        </Link>
        {(Object.keys(INVENTORY_STATUS_LABELS) as InventoryStatus[]).map((s) => (
          <Link key={s} href={qs({ stato: s })} className={cn("chip", sp.stato === s && "chip-active")}>
            {INVENTORY_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {groups.length === 0 && <EmptyState title="Nessun pezzo" text="Nessun pezzo corrisponde ai filtri selezionati." />}
      {groups.map((g) => (
        <section key={g.location.id} className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[24px] font-normal tracking-[-0.02em]">{g.location.name}</h2>
            <span className="text-sm text-soft">{g.items.reduce((s, i) => s + i.quantity, 0)} pezzi</span>
          </div>
          <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 xl:columns-4 [&>*]:mb-7">
            {g.items.map((i) => {
              const img = i.images[0] ?? i.productModel.images[0];
              return (
                <Link key={i.id} href={`/stock/${i.id}`} className="pressable group flex break-inside-avoid flex-col">
                  <div className="relative overflow-hidden rounded-[20px] bg-mist" style={{ aspectRatio: String(photoRatio(img?.width, img?.height)) }}>
                    <ProductImg storageKey={img?.storageKey} alt={i.productModel.name} cover className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.03]" />
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
                      <StatusPill status={i.status} />
                      <div className="flex flex-col items-end gap-1">
                        {i.quantity > 1 && <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-medium shadow-sm">× {i.quantity}</span>}
                        {i.isDemo && <DemoBadge className="bg-white/85" />}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-1 pt-3">
                    <p className="eyebrow truncate">{i.productModel.brand.name}</p>
                    <p className="truncate text-[16px] leading-snug sm:text-[17px]">{i.productModel.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-soft">{[i.composition, i.materialsDescription].filter(Boolean).join(" · ")}</p>
                    {(i.zone || (i.status === "IN_TRASFERIMENTO" && i.transferTo)) && (
                      <p className="text-[12.5px] text-muted">
                        {i.status === "IN_TRASFERIMENTO" && i.transferTo ? `→ ${i.transferTo.name}` : i.zone?.name}
                      </p>
                    )}
                    {i.reservations[0] && <p className="text-[12.5px] text-warning">Riservato per {i.reservations[0].client.name}</p>}
                    {can(user.role, "price:view") && i.price && (
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[16px]">{money(netPrice(i), i.currency)}</span>
                        {Number(i.discountPct) > 0 && <span className="text-[12.5px] text-muted line-through">{money(i.price, i.currency)}</span>}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
