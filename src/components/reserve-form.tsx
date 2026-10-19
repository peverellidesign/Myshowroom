"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import { reserve } from "@/app/(app)/stock/actions";

export type ReservableItem = { id: string; label: string; available: number };

/** Reservation form: inventory item, client, quantity, expiry, notes. */
export function ReserveForm({
  items,
  clients,
  defaultItemId,
  defaultClientId,
  onDone,
}: {
  items: ReservableItem[];
  clients: { id: string; name: string }[];
  defaultItemId?: string;
  defaultClientId?: string;
  onDone?: () => void;
}) {
  const defaultExpiry = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const minDate = new Date().toISOString().slice(0, 10);
  if (!items.length) {
    return <p className="text-sm text-soft">Nessun pezzo fisico disponibile da riservare. Il prodotto è ordinabile dal produttore.</p>;
  }
  return (
    <ActionForm action={reserve} onSuccess={onDone} className="space-y-4">
      <label className="block">
        <span className="label">Pezzo in stock</span>
        <select name="inventoryItemId" defaultValue={defaultItemId ?? items[0]?.id} className="field" required>
          {items.map((i) => (
            <option key={i.id} value={i.id} disabled={i.available <= 0}>
              {i.label} {i.available <= 0 ? "· già riservato" : i.available > 1 ? `· ${i.available} disponibili` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Cliente</span>
        <select name="clientId" defaultValue={defaultClientId ?? ""} className="field" required>
          <option value="" disabled>
            Seleziona cliente…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Quantità</span>
          <input name="quantity" type="number" min={1} defaultValue={1} className="field" />
        </label>
        <label className="block">
          <span className="label">Scadenza</span>
          <input name="expiresAt" type="date" min={minDate} defaultValue={defaultExpiry} className="field" required />
        </label>
      </div>
      <label className="block">
        <span className="label">Note</span>
        <textarea name="notes" rows={2} className="field" placeholder="Es. in attesa di conferma misure" />
      </label>
      <SubmitButton className="w-full">Conferma prenotazione</SubmitButton>
    </ActionForm>
  );
}
