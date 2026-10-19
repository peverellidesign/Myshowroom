"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "./ui/action-form";
import { ProductPicker, type PickerProduct } from "./product-picker";
import { recordVisit } from "@/app/(app)/clienti/actions";

type Opt = { id: string; name: string };

/** "Registra visita showroom": client (existing or new), products viewed, budget, preferences, next action. */
export function VisitForm({
  clients,
  locations,
  consultants,
  products,
  defaultClientId,
  defaultLocationId,
}: {
  clients: Opt[];
  locations: Opt[];
  consultants: Opt[];
  products: PickerProduct[];
  defaultClientId?: string;
  defaultLocationId?: string | null;
}) {
  const [mode, setMode] = useState<"existing" | "new">(defaultClientId || clients.length ? "existing" : "new");
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <ActionForm action={recordVisit} redirectTo={(d) => (d && !defaultClientId ? `/clienti/${(d as { clientId: string }).clientId}` : null)} className="space-y-4">
      {!defaultClientId && (
        <div className="flex gap-1 rounded-full bg-selected p-1 text-sm">
          <button type="button" onClick={() => setMode("existing")} className={`flex-1 rounded-full py-2 ${mode === "existing" ? "bg-white shadow-sm" : "text-soft"}`}>
            Cliente esistente
          </button>
          <button type="button" onClick={() => setMode("new")} className={`flex-1 rounded-full py-2 ${mode === "new" ? "bg-white shadow-sm" : "text-soft"}`}>
            Nuovo cliente
          </button>
        </div>
      )}
      {defaultClientId ? (
        <input type="hidden" name="clientId" value={defaultClientId} />
      ) : mode === "existing" ? (
        <select name="clientId" className="field" required defaultValue="">
          <option value="" disabled>
            Seleziona cliente…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <input name="newClientName" placeholder="Nome e cognome" className="field sm:col-span-3" required />
          <input name="newClientEmail" type="email" placeholder="Email" className="field sm:col-span-2" />
          <input name="newClientPhone" type="tel" placeholder="Telefono" className="field" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Data</span>
          <input name="date" type="datetime-local" defaultValue={local} className="field" />
        </label>
        <label className="block">
          <span className="label">Showroom</span>
          <select name="locationId" defaultValue={defaultLocationId ?? ""} className="field" required>
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
          <span className="label">Consulente</span>
          <select name="consultantId" defaultValue="" className="field">
            <option value="">Io</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <span className="label">Prodotti visti</span>
        <ProductPicker products={products} withStartPage={false} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="budget" placeholder="Budget" className="field" />
        <input name="projectType" placeholder="Tipo di progetto" className="field" />
        <input name="timeline" placeholder="Tempistiche" className="field" />
      </div>
      <textarea name="preferences" placeholder="Preferenze (stili, materiali, colori…)" className="field" rows={2} />
      <textarea name="notes" placeholder="Note" className="field" rows={2} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
        <input name="nextAction" placeholder="Prossima azione (es. inviare proposta)" className="field" />
        <input name="followUpDate" type="date" className="field" aria-label="Data follow-up" title="Crea un follow-up in Attività" />
      </div>
      <p className="px-1 text-xs text-muted">Indicando una data viene creato un follow-up nelle Attività. I prodotti visti si aggiungono agli interessi del cliente.</p>
      <SubmitButton className="w-full">Registra visita</SubmitButton>
    </ActionForm>
  );
}
