import { Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { WEEKDAY_LABELS, minutesToHHMM } from "@/lib/time";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ModalButton } from "@/components/ui/modal";
import { Badge } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { addAvailability, addZone, deleteAvailability, deleteZone, saveLocation } from "../actions";

export const metadata = { title: "Sedi" };

type Loc = Awaited<ReturnType<typeof db.location.findMany>>[number];

function LocationForm({ l }: { l?: Loc }) {
  return (
    <ActionForm action={saveLocation.bind(null, l?.id ?? null)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" defaultValue={l?.name} placeholder="Nome" className="field" required />
        <select name="type" defaultValue={l?.type ?? "SHOWROOM"} className="field">
          <option value="SHOWROOM">Showroom</option>
          <option value="WAREHOUSE">Magazzino</option>
        </select>
        <input name="city" defaultValue={l?.city} placeholder="Città" className="field" />
        <input name="country" defaultValue={l?.country} placeholder="Paese" className="field" />
      </div>
      <input name="address" defaultValue={l?.address ?? ""} placeholder="Indirizzo" className="field" />
      <div className="grid grid-cols-2 gap-3">
        <input name="phone" defaultValue={l?.phone ?? ""} placeholder="Telefono" className="field" />
        <input name="email" defaultValue={l?.email ?? ""} placeholder="Email" className="field" />
        <input name="slug" defaultValue={l?.slug} placeholder="Slug (per /book/…)" className="field" />
        <input name="timezone" defaultValue={l?.timezone ?? "Europe/Zurich"} placeholder="Fuso orario" className="field" />
        <input name="sortOrder" type="number" defaultValue={l?.sortOrder ?? 0} placeholder="Ordine" className="field" />
      </div>
      <label className="flex items-center gap-3 text-[15px]">
        <input type="checkbox" name="bookingEnabled" value="1" defaultChecked={l?.bookingEnabled} className="h-5 w-5 accent-[#222]" /> Prenotazione online attiva
      </label>
      {l && (
        <label className="flex items-center gap-3 text-[15px]">
          <input type="checkbox" name="active" value="1" defaultChecked={l.active} className="h-5 w-5 accent-[#222]" /> Sede attiva
        </label>
      )}
      <SubmitButton className="w-full">Salva sede</SubmitButton>
    </ActionForm>
  );
}

export default async function LocationsPage() {
  await requireUser("admin:settings");
  const [locations, consultants] = await Promise.all([
    db.location.findMany({ include: { zones: { orderBy: { name: "asc" } }, availability: { include: { user: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { active: true, roleKey: { in: ["SALES", "MANAGER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <ModalButton label={<><Plus size={15} /> Disponibilità consulente</>} title="Disponibilità per appuntamenti" className={buttonClass("secondary", "sm")}>
          <ActionForm action={addAvailability} className="space-y-3">
            <select name="userId" className="field" required defaultValue="">
              <option value="" disabled>Consulente…</option>
              {consultants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="locationId" className="field" required defaultValue="">
              <option value="" disabled>Showroom…</option>
              {locations.filter((l) => l.type === "SHOWROOM").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.slice(1).map((w, i) => (
                <label key={w} className="chip">
                  <input type="checkbox" name="weekday" value={i + 1} defaultChecked={i < 5} className="accent-[#222]" /> {w.slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input name="start" type="time" defaultValue="10:00" className="field" />
              <input name="end" type="time" defaultValue="18:30" className="field" />
            </div>
            <SubmitButton className="w-full">Aggiungi</SubmitButton>
          </ActionForm>
        </ModalButton>
        <ModalButton label={<><Plus size={15} /> Nuova sede</>} title="Nuova sede" className={buttonClass("primary", "sm")}>
          <LocationForm />
        </ModalButton>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {locations.map((l) => (
          <div key={l.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xl">{l.name}</p>
                <p className="text-sm text-soft">{l.type === "WAREHOUSE" ? "Magazzino" : "Showroom"} · {l.city} · {l.timezone}</p>
              </div>
              <div className="flex items-center gap-2">
                {!l.active && <Badge tone="danger">Disattiva</Badge>}
                {l.bookingEnabled && <Badge tone="success">/book/{l.slug}</Badge>}
                <ModalButton label="Modifica" title={l.name} className={buttonClass("secondary", "sm")}>
                  <LocationForm l={l} />
                </ModalButton>
              </div>
            </div>
            <p className="eyebrow mb-2 mt-4">Zone</p>
            <div className="flex flex-wrap gap-2">
              {l.zones.map((z) => (
                <span key={z.id} className="chip">
                  {z.name}
                  <ActionButton action={deleteZone.bind(null, z.id)} variant="ghost" size="icon" className="-my-2 -mr-3 h-7 w-7" confirm="Eliminare la zona?" title="Elimina">
                    <Trash2 size={12} />
                  </ActionButton>
                </span>
              ))}
              <ActionForm action={addZone.bind(null, l.id)} resetOnSuccess className="flex gap-1">
                <input name="name" placeholder="Nuova zona" className="w-32 rounded-full border border-line px-3 py-1.5 text-sm outline-none" />
                <SubmitButton size="sm" variant="subtle">+</SubmitButton>
              </ActionForm>
            </div>
            {l.type === "SHOWROOM" && (
              <>
                <p className="eyebrow mb-2 mt-4">Disponibilità consulenti</p>
                {l.availability.length === 0 && <p className="text-sm text-muted">Nessuna fascia: la prenotazione online non mostrerà orari.</p>}
                <div className="space-y-1">
                  {l.availability.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <span>{WEEKDAY_LABELS[a.weekday]} {minutesToHHMM(a.startMinute)}–{minutesToHHMM(a.endMinute)} · <span className="text-soft">{a.user.name}</span></span>
                      <ActionButton action={deleteAvailability.bind(null, a.id)} variant="ghost" size="icon" className="h-7 w-7" title="Elimina">
                        <Trash2 size={12} />
                      </ActionButton>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
