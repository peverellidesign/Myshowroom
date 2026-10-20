import Link from "next/link";
import { Plus, Store, Warehouse } from "lucide-react";
import type { InventoryStatus, LocationType, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { expireReservations } from "@/lib/inventory";
import { INVENTORY_STATUS_LABELS, money, netPrice } from "@/lib/format";
import { ProductImg, StatusText } from "@/components/product-card";
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
            className={cn("card min-w-[150px] p-4 transition hover:border-ink/25", sp.sede === l.id && "border-ink")}
          >
            <div className="flex items-center justify-between text-soft">
              {l.type === "WAREHOUSE" ? <Warehouse size={18} strokeWidth={1.4} /> : <Store size={18} strokeWidth={1.4} />}
              <span className="text-2xl font-light text-[#555]">{String(countFor(l.id)).padStart(2, "0")}</span>
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
            <h2 className="text-2xl tracking-[-0.01em]">{g.location.name}</h2>
            <span className="text-sm text-soft">{g.items.reduce((s, i) => s + i.quantity, 0)} pezzi</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {g.items.map((i) => {
              const img = i.images[0]?.storageKey ?? i.productModel.images[0]?.storageKey;
              return (
                <Link key={i.id} href={`/stock/${i.id}`} className="card group flex flex-col overflow-hidden transition hover:border-ink/25">
                  <div className="relative aspect-[4/3] border-b border-line bg-[#F7F7F5]">
                    <ProductImg storageKey={img} alt={i.productModel.name} className="absolute inset-0 h-full w-full p-4" />
                    {i.isDemo && <DemoBadge className="absolute right-3 top-3 bg-white/80" />}
                    {i.images.length > 0 && <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[10px] uppercase tracking-wider text-soft">Foto reale</span>}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="eyebrow">{i.productModel.brand.name}</p>
                    <p className="text-[17px] leading-tight">{i.productModel.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-soft">{[i.composition, i.materialsDescription].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-sm">
                      <StatusText status={i.status} />
                      {i.status === "IN_TRASFERIMENTO" && i.transferTo && <span className="text-soft"> → {i.transferTo.name}</span>}
                      {i.zone && <span className="text-muted"> · {i.zone.name}</span>}
                    </p>
                    {i.reservations[0] && <p className="text-xs text-[#7A5B24]">per {i.reservations[0].client.name}</p>}
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <span className="text-[15px]">
                        {can(user.role, "price:view") && i.price ? (
                          <>
                            {money(netPrice(i), i.currency)}
                            {Number(i.discountPct) > 0 && <span className="ml-1.5 text-xs text-muted line-through">{money(i.price, i.currency)}</span>}
                          </>
                        ) : (
                          ""
                        )}
                      </span>
                      <span className="text-xs text-muted">{i.quantity > 1 ? `× ${i.quantity}` : ""}</span>
                    </div>
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
