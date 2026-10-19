"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import { ProductPicker, type PickerProduct } from "./product-picker";
import type { ActionResult } from "@/lib/action";

type Opt = { id: string; name: string };

export function ClientForm({
  action,
  locations,
  consultants,
  products,
  values,
  isNew,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  locations: Opt[];
  consultants: Opt[];
  products?: PickerProduct[];
  values?: { name: string; email: string | null; phone: string | null; company: string | null; city: string | null; preferredLocationId: string | null; consultantId: string | null; notes: string | null };
  isNew?: boolean;
}) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess={isNew}
      redirectTo={isNew ? (d) => ((d as { id?: string })?.id ? `/clienti/${(d as { id: string }).id}` : null) : undefined}
      className="space-y-3"
    >
      <input name="name" defaultValue={values?.name} placeholder="Nome e cognome" className="field" required />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="email" type="email" defaultValue={values?.email ?? ""} placeholder="Email" className="field" />
        <input name="phone" type="tel" defaultValue={values?.phone ?? ""} placeholder="Telefono" className="field" />
        <input name="company" defaultValue={values?.company ?? ""} placeholder="Azienda / studio" className="field" />
        <input name="city" defaultValue={values?.city ?? ""} placeholder="Città" className="field" />
        <select name="preferredLocationId" defaultValue={values?.preferredLocationId ?? ""} className="field" aria-label="Showroom preferito">
          <option value="">Showroom preferito…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select name="consultantId" defaultValue={values?.consultantId ?? ""} className="field" aria-label="Consulente">
          <option value="">Consulente assegnato…</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <textarea name="notes" defaultValue={values?.notes ?? ""} placeholder="Prodotti di interesse, esigenze, note…" className="field" rows={3} />
      {products && (
        <div>
          <span className="label">Prodotti di interesse</span>
          <ProductPicker products={products} withStartPage={false} />
        </div>
      )}
      <SubmitButton className="w-full">Salva cliente</SubmitButton>
    </ActionForm>
  );
}
