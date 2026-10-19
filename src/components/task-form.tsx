"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";

type Opt = { id: string; name: string };

export function TaskForm({
  action,
  users,
  clients,
  appointments,
  quotations,
  values,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  users: Opt[];
  clients: Opt[];
  appointments: Opt[];
  quotations: Opt[];
  values?: { title: string; description: string | null; dueDate: string; priority: string; assigneeId: string | null; clientId: string | null; appointmentId: string | null; quotationId: string | null };
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!values} className="space-y-3">
      <input name="title" defaultValue={values?.title} placeholder="Es. Richiamare cliente" className="field" required />
      <textarea name="description" defaultValue={values?.description ?? ""} placeholder="Dettagli" className="field" rows={2} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Scadenza</span>
          <input name="dueDate" type="date" defaultValue={values?.dueDate} className="field" />
        </label>
        <label className="block">
          <span className="label">Priorità</span>
          <select name="priority" defaultValue={values?.priority ?? "MEDIA"} className="field">
            <option value="BASSA">Bassa</option>
            <option value="MEDIA">Media</option>
            <option value="ALTA">Alta</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Assegnata a</span>
          <select name="assigneeId" defaultValue={values?.assigneeId ?? ""} className="field">
            <option value="">Me</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <select name="clientId" defaultValue={values?.clientId ?? ""} className="field" aria-label="Cliente">
          <option value="">Cliente…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="appointmentId" defaultValue={values?.appointmentId ?? ""} className="field" aria-label="Appuntamento">
          <option value="">Appuntamento…</option>
          {appointments.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="quotationId" defaultValue={values?.quotationId ?? ""} className="field" aria-label="Preventivo">
          <option value="">Preventivo…</option>
          {quotations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="w-full">{values ? "Salva" : "Aggiungi attività"}</SubmitButton>
    </ActionForm>
  );
}
