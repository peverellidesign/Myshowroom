import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ModalButton } from "@/components/ui/modal";
import { addFinish, deleteFinish, saveBrand, saveCategory, saveMaterial } from "../actions";

export const metadata = { title: "Brand e materiali" };

export default async function CatalogAdmin() {
  await requireUser("product:edit");
  const [brands, categories, materials] = await Promise.all([
    db.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
    db.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
    db.material.findMany({ include: { brand: true, finishes: { orderBy: { name: "asc" } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="mb-3 text-xl">Brand</h2>
        <div className="divide-y divide-line">
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2.5 text-[15px]">
              <span>
                {b.name} <span className="text-sm text-muted">· {b._count.products} prodotti</span>
              </span>
              <ModalButton label="Modifica" title={b.name} className="text-sm link-quiet">
                <ActionForm action={saveBrand.bind(null, b.id)} className="space-y-3">
                  <input name="name" defaultValue={b.name} className="field" />
                  <input name="website" defaultValue={b.website ?? ""} placeholder="Sito web" className="field" />
                  <input name="country" defaultValue={b.country ?? ""} placeholder="Paese" className="field" />
                  <SubmitButton className="w-full">Salva</SubmitButton>
                </ActionForm>
              </ModalButton>
            </div>
          ))}
        </div>
        <ActionForm action={saveBrand.bind(null, null)} resetOnSuccess className="mt-3 flex gap-2">
          <input name="name" placeholder="Nuovo brand" className="field" />
          <SubmitButton>Aggiungi</SubmitButton>
        </ActionForm>
      </section>
      <section className="card p-5">
        <h2 className="mb-3 text-xl">Categorie</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="chip">
              {c.name} <span className="text-muted">{c._count.products}</span>
            </span>
          ))}
        </div>
        <ActionForm action={saveCategory.bind(null, null)} resetOnSuccess className="mt-4 flex gap-2">
          <input name="name" placeholder="Nuova categoria" className="field" />
          <SubmitButton>Aggiungi</SubmitButton>
        </ActionForm>
      </section>
      <section className="card p-5 lg:col-span-2">
        <h2 className="mb-3 text-xl">Materiali e finiture</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {materials.map((m) => (
            <div key={m.id} className="rounded-2xl border border-line p-4">
              <p className="text-[15px]">
                {m.name} <span className="text-sm text-muted">· {m.type}{m.brand && ` · ${m.brand.name}`}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {m.finishes.map((f) => (
                  <span key={f.id} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-2 pr-1 text-xs">
                    <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: f.hexColor }} />
                    {f.name}
                    <ActionButton action={deleteFinish.bind(null, f.id)} variant="ghost" size="icon" className="h-6 w-6" confirm="Eliminare la finitura?" title="Elimina">
                      <Trash2 size={11} />
                    </ActionButton>
                  </span>
                ))}
              </div>
              <ActionForm action={addFinish.bind(null, m.id)} resetOnSuccess className="mt-3 flex gap-2">
                <input name="name" placeholder="Nuova finitura" className="min-w-0 flex-1 rounded-full border border-line px-3 py-1.5 text-sm outline-none" />
                <input name="hexColor" type="color" defaultValue="#cccccc" className="h-8 w-10 rounded-full border border-line" aria-label="Colore" />
                <SubmitButton size="sm" variant="subtle">+</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </div>
        <ActionForm action={saveMaterial} resetOnSuccess className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_200px_auto]">
          <input name="name" placeholder="Nuovo materiale" className="field" />
          <input name="type" placeholder="Tipo (Tessuto, Legno…)" className="field" />
          <select name="brandId" defaultValue="" className="field">
            <option value="">Tutti i brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <SubmitButton>Aggiungi</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
