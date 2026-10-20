import { Suspense } from "react";
import { GitCompareArrows, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getFilterOptions, parseProductFilters, searchProducts } from "@/lib/products";
import { ProductCard } from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Prodotti" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("product:view");
  const sp = await searchParams;
  const filters = parseProductFilters(sp);
  const [products, opts] = await Promise.all([searchProducts(filters, user.id), getFilterOptions()]);
  const colors = [...new Set(opts.materials.flatMap((m) => m.finishes.map((f) => f.name)))].sort();
  const list = sp.vista === "lista";

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="01 / Product library"
        title="La collezione."
        subtitle="Scopri cosa abbiamo, dove si trova e come proporlo."
        actions={
          <>
            <LinkButton href="/prodotti/confronta" variant="secondary" size="sm" className="hidden sm:inline-flex">
              <GitCompareArrows size={15} /> Confronta
            </LinkButton>
            {can(user.role, "product:edit") && (
              <LinkButton href="/prodotti/nuovo" size="sm">
                <Plus size={15} /> Nuovo prodotto
              </LinkButton>
            )}
          </>
        }
      />
      <Suspense>
        <ProductFilters
          brands={opts.brands}
          categories={opts.categories}
          locations={opts.locations}
          materials={opts.materials.map((m) => ({ id: m.id, name: m.brand ? `${m.name} (${m.brand.name})` : m.name }))}
          colors={colors}
          count={products.length}
        />
      </Suspense>
      <div className="mt-5">
        {products.length === 0 ? (
          <EmptyState title="Nessun prodotto trovato" text="Prova a modificare la ricerca o i filtri." />
        ) : list ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} compact />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
