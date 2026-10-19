"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/format";

type Opt = { id: string; name: string };

export function AppointmentForm({
  action,
  clients,
  locations,
  consultants,
  values,
  isNew,
  emailEnabled,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  clients?: Opt[];
  locations: Opt[];
  consultants: Opt[];
  values?: { clientId?: string | null; locationId?: string | null; consultantId?: string | null; type?: string; day?: string; time?: string; duration?: number; notes?: string | null };
  isNew?: boolean;
  emailEnabled?: boolean;
}) {
  return (
    <ActionForm action={action} redirectTo={isNew ? (d) => ((d as { day?: string })?.day ? `/agenda?giorno=${(d as { day: string }).day}` : null) : undefined} className="space-y-4">
      {clients && (
        <label className="block">
          <span className="label">Cliente</span>
          <select name="clientId" defaultValue={values?.clientId ?? ""} className="field">
            <option value="">— Nessun cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Showroom</span>
          <select name="locationId" defaultValue={values?.locationId ?? ""} className="field" required>
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
          <span className="label">Tipo di consulenza</span>
          <select name="type" defaultValue={values?.type ?? "CONSULENZA_ARREDO"} className="field">
            {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Data</span>
          <input name="day" type="date" defaultValue={values?.day} className="field" required />
        </label>
        <label className="block">
          <span className="label">Ora</span>
          <input name="time" type="time" step={900} defaultValue={values?.time ?? "10:00"} className="field" required />
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className="label">Durata</span>
          <select name="duration" defaultValue={String(values?.duration ?? 60)} className="field">
            {[30, 45, 60, 90, 120, 180].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`.replace(".5", ",5")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Consulente</span>
        <select name="consultantId" defaultValue={values?.consultantId ?? ""} className="field">
          <option value="">Assegna automaticamente un consulente libero</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <textarea name="notes" defaultValue={values?.notes ?? ""} placeholder="Note" className="field" rows={2} />
      {isNew && (
        <label className="flex items-center gap-3 px-1 text-[15px]">
          <input type="checkbox" name="sendConfirmation" value="1" disabled={!emailEnabled} defaultChecked={emailEnabled} className="h-5 w-5 accent-[#222]" />
          <span>
            Invia conferma via email al cliente
            {!emailEnabled && <span className="block text-xs text-muted">Non disponibile: server email non configurato.</span>}
          </span>
        </label>
      )}
      <p className="px-1 text-xs text-muted">Il sistema impedisce sovrapposizioni per lo stesso consulente.</p>
      <SubmitButton className="w-full">{isNew ? "Salva appuntamento" : "Riprogramma"}</SubmitButton>
    </ActionForm>
  );
}
