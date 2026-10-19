import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ModalButton } from "@/components/ui/modal";
import { Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { createUser, updateUser } from "../actions";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser("admin:users");
  const [users, locations] = await Promise.all([
    db.user.findMany({ include: { defaultLocation: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.location.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const roleOptions = Object.entries(ROLE_LABELS);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <div className="card divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">
                {u.name} {u.id === me.id && <span className="text-muted">(tu)</span>}
              </p>
              <p className="truncate text-sm text-soft">
                {u.email} · {u.defaultLocation?.name ?? "—"} · dal {fmtDate(u.createdAt)}
              </p>
            </div>
            <Badge tone={u.active ? "neutral" : "danger"}>{u.active ? ROLE_LABELS[u.roleKey] : "Disattivato"}</Badge>
            <ModalButton label="Modifica" title={u.name} className={buttonClass("secondary", "sm")}>
              <ActionForm action={updateUser.bind(null, u.id)} className="space-y-3">
                <input name="name" defaultValue={u.name} className="field" />
                <input name="phone" defaultValue={u.phone ?? ""} placeholder="Telefono" className="field" />
                <select name="roleKey" defaultValue={u.roleKey} className="field">
                  {roleOptions.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select name="defaultLocationId" defaultValue={u.defaultLocationId ?? ""} className="field">
                  <option value="">Sede predefinita…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <input name="password" type="password" placeholder="Nuova password (lascia vuoto per non cambiarla)" className="field" autoComplete="new-password" />
                <label className="flex items-center gap-3 text-[15px]">
                  <input type="checkbox" name="active" value="1" defaultChecked={u.active} className="h-5 w-5 accent-[#222]" /> Account attivo
                </label>
                <SubmitButton className="w-full">Salva</SubmitButton>
              </ActionForm>
            </ModalButton>
          </div>
        ))}
      </div>
      <div className="card h-fit p-5">
        <h2 className="mb-4 text-xl">Nuovo utente</h2>
        <ActionForm action={createUser} resetOnSuccess className="space-y-3">
          <input name="name" placeholder="Nome e cognome" className="field" required />
          <input name="email" type="email" placeholder="Email" className="field" required />
          <select name="roleKey" defaultValue="SALES" className="field">
            {roleOptions.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="defaultLocationId" defaultValue="" className="field">
            <option value="">Sede predefinita…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input name="password" type="password" placeholder="Password iniziale (min. 10 caratteri)" className="field" required minLength={10} autoComplete="new-password" />
          <SubmitButton className="w-full">Crea utente</SubmitButton>
        </ActionForm>
        <div className="mt-5 space-y-1 text-xs text-muted">
          <p><strong className="font-medium text-soft">Amministratore</strong>: tutto, inclusi utenti e impostazioni.</p>
          <p><strong className="font-medium text-soft">Manager</strong>: catalogo, documenti (anche riservati), prezzi, stock.</p>
          <p><strong className="font-medium text-soft">Consulente</strong>: clienti, preventivi, prenotazioni, agenda, email.</p>
          <p><strong className="font-medium text-soft">Magazzino</strong>: stock e trasferimenti, senza prezzi né clienti.</p>
        </div>
      </div>
    </div>
  );
}
