import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { inventoryFormOptions } from "@/lib/inventory-options";
import { InventoryForm } from "@/components/inventory-form";
import { PageHeader } from "@/components/ui/misc";
import { createInventoryItem } from "../actions";

export const metadata = { title: "Nuovo pezzo" };

export default async function NewInventoryPage({ searchParams }: { searchParams: Promise<{ prodotto?: string; sede?: string }> }) {
  await requireUser("inventory:edit");
  const { prodotto, sede } = await searchParams;
  const opts = await inventoryFormOptions();
  return (
    <div className="mx-auto max-w-2xl animate-fadein">
      <Link href="/stock" className="mb-5 inline-flex items-center gap-2 text-[15px] hover:text-soft">
        <ArrowLeft size={17} /> Stock
      </Link>
      <PageHeader eyebrow="Inventario fisico" title="Nuovo pezzo." subtitle="Registra un pezzo realmente presente in una sede Peverelli." />
      <div className="card p-5 sm:p-7">
        <InventoryForm action={createInventoryItem} {...opts} values={{ productModelId: prodotto, locationId: sede }} isNew />
      </div>
    </div>
  );
}
