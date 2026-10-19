import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AVAILABLE_STATUSES, money } from "@/lib/format";
import { ProductImg } from "@/components/product-card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { CompareSync, RemoveFromCompare } from "./compare-picker";

export const metadata = { title: "Confronta" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser("product:view");
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 4);
  const products = ids.length
    ? await db.productModel.findMany({
        where: { id: { in: ids } },
        include: {
          brand: true,
          category: true,
          images: { where: { isMain: true }, take: 1 },
          configurations: { include: { compatibility: { include: { material: true } } } },
          inventory: { where: { status: { in: AVAILABLE_STATUSES } }, include: { location: true } },
        },
      })
    : [];
  const ordered = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is (typeof products)[number] => !!p);
  const rows: [string, (p: (typeof ordered)[number]) => React.ReactNode][] = [
    ["Brand", (p) => p.brand.name],
    ["Categoria", (p) => p.category.name],
    ["Designer", (p) => p.designer ?? "—"],
    ["Dimensioni", (p) => p.dimensions ?? "—"],
    ["Composizioni", (p) => p.configurations.map((c) => c.name).join(", ") || "—"],
    ["Materiali", (p) => [...new Set(p.configurations.flatMap((c) => c.compatibility.map((x) => x.material.name)))].join(", ") || "—"],
    ["In stock Peverelli", (p) => (p.inventory.length ? `${p.inventory.reduce((s, i) => s + i.quantity, 0)} pz · ${[...new Set(p.inventory.map((i) => i.location.name))].join(", ")}` : "Solo su ordinazione")],
    ...(can(user.role, "price:view") ? ([["Prezzo indicativo", (p) => (p.listPrice ? money(p.listPrice, p.currency) : "Su richiesta")]] as typeof rows) : []),
  ];

  return (
    <div className="animate-fadein">
      <Suspense>
        <CompareSync />
      </Suspense>
      <PageHeader eyebrow="Prodotti" title="Confronta." subtitle="Fino a quattro modelli, fianco a fianco." />
      {ordered.length === 0 ? (
        <EmptyState title="Nessun prodotto da confrontare" text="Apri una scheda prodotto e tocca «Confronta»." action={<LinkButton href="/prodotti">Vai ai prodotti</LinkButton>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[15px]">
            <thead>
              <tr>
                <th className="w-40" />
                {ordered.map((p) => (
                  <th key={p.id} className="px-3 pb-4 align-bottom font-normal">
                    <Link href={`/prodotti/${p.id}`}>
                      <ProductImg storageKey={p.images[0]?.storageKey} alt={p.name} className="mb-3 aspect-[4/3] w-full rounded-2xl border border-line bg-white p-3" />
                      <span className="eyebrow block">{p.brand.name}</span>
                      <span className="text-lg">{p.name}</span>
                    </Link>
                    <div>
                      <RemoveFromCompare id={p.id} ids={ids} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label}>
                  <td className="border-t border-line py-3 pr-3 text-soft">{label}</td>
                  {ordered.map((p) => (
                    <td key={p.id} className="border-t border-line px-3 py-3 align-top">
                      {fn(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
