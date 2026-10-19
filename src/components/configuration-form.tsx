"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";

type MaterialOpt = { id: string; name: string; type: string; finishes: { id: string; name: string; hexColor: string }[] };

export function ConfigurationForm({
  action,
  materials,
  values,
  onDone,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  materials: MaterialOpt[];
  values?: {
    name: string;
    code: string | null;
    dimensions: string | null;
    widthCm: number | null;
    depthCm: number | null;
    heightCm: number | null;
    price: number | null;
    currency: string;
    notes: string | null;
    source: string | null;
    finishIds: string[];
    materialIds: string[];
  };
  onDone?: () => void;
}) {
  return (
    <ActionForm action={action} onSuccess={onDone} className="space-y-4">
      <p className="rounded-2xl bg-selected px-4 py-3 text-sm text-soft">
        Inserisci solo composizioni e compatibilità documentate nel catalogo ufficiale del produttore, indicando la fonte.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Nome composizione</span>
          <input name="name" defaultValue={values?.name} required className="field" />
        </label>
        <label className="block">
          <span className="label">Codice produttore</span>
          <input name="code" defaultValue={values?.code ?? ""} className="field" />
        </label>
      </div>
      <label className="block">
        <span className="label">Dimensioni</span>
        <input name="dimensions" defaultValue={values?.dimensions ?? ""} className="field" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <input name="widthCm" type="number" min={0} placeholder="L cm" defaultValue={values?.widthCm ?? ""} className="field" aria-label="Larghezza" />
        <input name="depthCm" type="number" min={0} placeholder="P cm" defaultValue={values?.depthCm ?? ""} className="field" aria-label="Profondità" />
        <input name="heightCm" type="number" min={0} placeholder="H cm" defaultValue={values?.heightCm ?? ""} className="field" aria-label="Altezza" />
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <label className="block">
          <span className="label">Prezzo (se disponibile)</span>
          <input name="price" type="number" min={0} step="0.01" defaultValue={values?.price ?? ""} className="field" />
        </label>
        <label className="block">
          <span className="label">Valuta</span>
          <select name="currency" defaultValue={values?.currency ?? "EUR"} className="field">
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </label>
      </div>
      <div>
        <span className="label">Materiali e finiture compatibili</span>
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-line bg-white p-4">
          {materials.map((m) => (
            <div key={m.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="materialIds" value={m.id} defaultChecked={values?.materialIds.includes(m.id)} className="accent-[#222]" />
                <span className="text-ink">{m.name}</span> <span className="text-muted">· {m.type}</span>
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2 pl-6">
                {m.finishes.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs">
                    <input type="checkbox" name="finishIds" value={f.id} defaultChecked={values?.finishIds.includes(f.id)} className="accent-[#222]" />
                    <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: f.hexColor }} />
                    {f.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">Fonte ufficiale</span>
        <input name="source" defaultValue={values?.source ?? ""} required className="field" placeholder="Es. Catalogo generale 2026, p. 42" />
      </label>
      <label className="block">
        <span className="label">Note</span>
        <textarea name="notes" rows={2} defaultValue={values?.notes ?? ""} className="field" />
      </label>
      <SubmitButton className="w-full">Salva composizione</SubmitButton>
    </ActionForm>
  );
}
