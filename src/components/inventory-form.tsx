"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";

type Product = { id: string; label: string; configurations: { id: string; name: string; dimensions: string | null }[] };
type Location = { id: string; name: string; zones: { id: string; name: string }[] };
type Material = { id: string; label: string; finishes: { id: string; name: string }[] };

export type InventoryValues = {
  productModelId: string;
  configurationId: string | null;
  composition: string | null;
  materialId: string | null;
  finishId: string | null;
  materialsDescription: string | null;
  dimensions: string | null;
  quantity: number;
  locationId: string;
  zoneId: string | null;
  baseStatus: string;
  price: number | null;
  currency: string;
  discountPct: number;
  notes: string | null;
  code?: string;
};

export function InventoryForm({
  action,
  products,
  locations,
  materials,
  values,
  isNew,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  products: Product[];
  locations: Location[];
  materials: Material[];
  values?: Partial<InventoryValues>;
  isNew?: boolean;
}) {
  const [productId, setProductId] = useState(values?.productModelId ?? "");
  const [locationId, setLocationId] = useState(values?.locationId ?? "");
  const [materialId, setMaterialId] = useState(values?.materialId ?? "");
  const product = products.find((p) => p.id === productId);
  const location = locations.find((l) => l.id === locationId);
  const material = materials.find((m) => m.id === materialId);

  return (
    <ActionForm
      action={action}
      redirectTo={isNew ? (d) => ((d as { id?: string } | undefined)?.id ? `/stock/${(d as { id: string }).id}` : null) : undefined}
      className="space-y-4"
    >
      <label className="block">
        <span className="label">Modello prodotto</span>
        <select name="productModelId" value={productId} onChange={(e) => setProductId(e.target.value)} className="field" required>
          <option value="" disabled>
            Seleziona…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Composizione documentata</span>
          <select name="configurationId" defaultValue={values?.configurationId ?? ""} className="field">
            <option value="">—</option>
            {product?.configurations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Descrizione composizione</span>
          <input name="composition" defaultValue={values?.composition ?? ""} className="field" placeholder="Es. Poltrona" />
        </label>
        <label className="block">
          <span className="label">Materiale</span>
          <select name="materialId" value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="field">
            <option value="">—</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Finitura / colore</span>
          <select name="finishId" defaultValue={values?.finishId ?? ""} className="field">
            <option value="">—</option>
            {material?.finishes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Materiali e finiture esatti</span>
        <input name="materialsDescription" defaultValue={values?.materialsDescription ?? ""} className="field" placeholder="Es. Tessuto bouclé / Grigio perla" />
      </label>
      <label className="block">
        <span className="label">Dimensioni reali</span>
        <input name="dimensions" defaultValue={values?.dimensions ?? ""} className="field" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Sede</span>
          <select name="locationId" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="field" required>
            <option value="" disabled>
              Seleziona…
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Zona</span>
          <select name="zoneId" defaultValue={values?.zoneId ?? ""} className="field">
            <option value="">—</option>
            {location?.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Stato</span>
          <select name="baseStatus" defaultValue={values?.baseStatus ?? "DISPONIBILE"} className="field">
            <option value="ESPOSTO">Esposto</option>
            <option value="DISPONIBILE">Disponibile</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="label">Quantità</span>
          <input name="quantity" type="number" min={0} defaultValue={values?.quantity ?? 1} className="field" />
        </label>
        <label className="block">
          <span className="label">Prezzo</span>
          <input name="price" type="number" min={0} step="0.01" defaultValue={values?.price ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="label">Valuta</span>
          <select name="currency" defaultValue={values?.currency ?? "EUR"} className="field">
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Sconto %</span>
          <input name="discountPct" type="number" min={0} max={100} step="any" defaultValue={values?.discountPct ?? 0} className="field" />
        </label>
      </div>
      {isNew && (
        <>
          <label className="block">
            <span className="label">Codice inventario (vuoto = automatico)</span>
            <input name="code" className="field" />
          </label>
          <label className="block">
            <span className="label">Foto reali del pezzo</span>
            <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple className="field py-2.5" />
          </label>
        </>
      )}
      <label className="block">
        <span className="label">Note interne</span>
        <textarea name="notes" defaultValue={values?.notes ?? ""} className="field" />
      </label>
      <SubmitButton className="w-full">{isNew ? "Aggiungi allo stock" : "Salva modifiche"}</SubmitButton>
    </ActionForm>
  );
}
