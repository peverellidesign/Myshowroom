"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";

type Opt = { id: string; name: string };
export type ProductFormValues = {
  name?: string;
  code?: string;
  brandId?: string;
  categoryId?: string;
  designer?: string | null;
  year?: number | null;
  description?: string;
  dimensions?: string | null;
  widthCm?: number | null;
  depthCm?: number | null;
  heightCm?: number | null;
  listPrice?: number | null;
  currency?: string;
};

export function ProductForm({
  action,
  brands,
  categories,
  values = {},
  onDone,
  redirect,
}: {
  action: (fd: FormData) => Promise<ActionResult<{ id: string } | void>>;
  brands: Opt[];
  categories: Opt[];
  values?: ProductFormValues;
  onDone?: () => void;
  redirect?: boolean;
}) {
  return (
    <ActionForm action={action} onSuccess={onDone} redirectTo={redirect ? (d) => (d && d.id ? `/prodotti/${d.id}` : null) : undefined} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Brand</span>
          <select name="brandId" defaultValue={values.brandId ?? ""} className="field" required>
            <option value="" disabled>
              Seleziona…
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Categoria</span>
          <select name="categoryId" defaultValue={values.categoryId ?? ""} className="field" required>
            <option value="" disabled>
              Seleziona…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Nome modello</span>
          <input name="name" defaultValue={values.name} required className="field" />
        </label>
        <label className="block">
          <span className="label">Codice prodotto</span>
          <input name="code" defaultValue={values.code} required className="field" />
        </label>
        <label className="block">
          <span className="label">Designer</span>
          <input name="designer" defaultValue={values.designer ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="label">Anno</span>
          <input name="year" type="number" defaultValue={values.year ?? ""} className="field" />
        </label>
      </div>
      <label className="block">
        <span className="label">Descrizione</span>
        <textarea name="description" rows={4} defaultValue={values.description} className="field" />
      </label>
      <label className="block">
        <span className="label">Dimensioni (testo)</span>
        <input name="dimensions" defaultValue={values.dimensions ?? ""} className="field" placeholder="L 200 × P 90 × H 73 cm" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="label">Larghezza cm</span>
          <input name="widthCm" type="number" min={0} defaultValue={values.widthCm ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="label">Profondità cm</span>
          <input name="depthCm" type="number" min={0} defaultValue={values.depthCm ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="label">Altezza cm</span>
          <input name="heightCm" type="number" min={0} defaultValue={values.heightCm ?? ""} className="field" />
        </label>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <label className="block">
          <span className="label">Prezzo di listino indicativo</span>
          <input name="listPrice" type="number" min={0} step="0.01" defaultValue={values.listPrice ?? ""} className="field" placeholder="Vuoto = su richiesta" />
        </label>
        <label className="block">
          <span className="label">Valuta</span>
          <select name="currency" defaultValue={values.currency ?? "EUR"} className="field">
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </label>
      </div>
      <SubmitButton className="w-full">Salva prodotto</SubmitButton>
    </ActionForm>
  );
}
