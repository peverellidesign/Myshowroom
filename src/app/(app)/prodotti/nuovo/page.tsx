import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductForm } from "@/components/product-form";
import { PageHeader } from "@/components/ui/misc";
import { createProduct } from "../actions";

export const metadata = { title: "Nuovo prodotto" };

export default async function NewProductPage() {
  await requireUser("product:edit");
  const [brands, categories] = await Promise.all([db.brand.findMany({ orderBy: { name: "asc" } }), db.category.findMany({ orderBy: { name: "asc" } })]);
  return (
    <div className="mx-auto max-w-2xl animate-fadein">
      <Link href="/prodotti" className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Prodotti
      </Link>
      <PageHeader eyebrow="Product library" title="Nuovo modello." subtitle="Dopo il salvataggio potrai aggiungere immagini, composizioni e cataloghi." />
      <div className="card p-5 sm:p-7">
        <ProductForm action={createProduct} brands={brands} categories={categories} redirect />
      </div>
      <p className="mt-4 text-sm text-soft">
        Brand o categoria mancanti? Aggiungili in <Link href="/admin/catalogo" className="link-quiet">Amministrazione → Brand e materiali</Link>.
      </p>
    </div>
  );
}
