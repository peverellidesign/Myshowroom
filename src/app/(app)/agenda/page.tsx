import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS, fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { addDays, dayKey, isoWeekday, minutesOfDay, minutesToHHMM, zonedToUtc } from "@/lib/time";
import { AppointmentForm } from "@/components/appointment-form";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton } from "@/components/ui/action-form";
import { Badge, PageHeader } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createAppointment, rescheduleAppointment, setAppointmentStatus } from "./actions";

export const metadata = { title: "Agenda" };
const TZ = "Europe/Zurich";

type Appt = Awaited<ReturnType<typeof loadAppointments>>[number];

function loadAppointments(where: Prisma.AppointmentWhereInput, desc: boolean) {
  return db.appointment.findMany({ where, include: { client: true, location: true, consultant: true }, orderBy: { startsAt: desc ? "desc" : "asc" }, take: 300 });
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ vista?: string; giorno?: string; sede?: string; nuovo?: string; cliente?: string }> }) {
  const user = await requireUser("appointment:view");
  const sp = await searchParams;
  const vista = sp.vista ?? "giorno";
  const today = dayKey(new Date(), TZ);
  const day = sp.giorno && /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno) ? sp.giorno : today;
  const weekStart = addDays(day, 1 - isoWeekday(day));

  let from: Date;
  let to: Date;
  if (vista === "settimana") {
    from = zonedToUtc(weekStart, 0, TZ);
    to = zonedToUtc(addDays(weekStart, 7), 0, TZ);
  } else if (vista === "prossimi") {
    from = new Date();
    to = new Date(Date.now() + 120 * 86400_000);
  } else if (vista === "storico") {
    from = new Date(Date.now() - 365 * 86400_000);
    to = new Date();
  } else {
    from = zonedToUtc(day, 0, TZ);
    to = zonedToUtc(addDays(day, 1), 0, TZ);
  }

  const where: Prisma.AppointmentWhereInput = { startsAt: { gte: from, lt: to } };
  if (sp.sede) where.locationId = sp.sede;
  if (vista !== "storico") where.status = { not: "ANNULLATO" };

  const canEdit = can(user.role, "appointment:edit");
  const [appointments, locations, clients, consultants] = await Promise.all([
    loadAppointments(where, vista === "storico"),
    db.location.findMany({ where: { active: true, type: "SHOWROOM" }, orderBy: { sortOrder: "asc" } }),
    canEdit ? db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    db.user.findMany({ where: { active: true, roleKey: { in: ["SALES", "MANAGER", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const email = emailConfigured();

  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { vista, giorno: day, sede: sp.sede ?? null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/agenda?${p.toString()}`;
  };
  const step = vista === "settimana" ? 7 : 1;

  const card = (a: Appt, compact = false) => (
    <ModalButton
      key={a.id}
      title={a.client?.name ?? APPOINTMENT_TYPE_LABELS[a.type]}
      className={cn("card block w-full text-left transition hover:border-ink/25", compact ? "p-3" : "p-4", a.status !== "CONFERMATO" && "opacity-60")}
      label={
        <span className="block">
          <span className="block text-sm text-soft">
            {vista === "prossimi" || vista === "storico" ? fmtDateTime(a.startsAt) : `${fmtTime(a.startsAt)}–${fmtTime(a.endsAt)}`} · {a.location.name}
          </span>
          <span className={cn("block truncate text-ink", compact ? "text-[14px]" : "text-[16px]")}>{a.client?.name ?? "Senza cliente"}</span>
          <span className="block truncate text-sm text-muted">
            {APPOINTMENT_TYPE_LABELS[a.type]}
            {!compact && a.consultant && ` · ${a.consultant.name}`}
            {a.source === "PUBBLICO" && " · prenotazione online"}
            {a.status !== "CONFERMATO" && ` · ${APPOINTMENT_STATUS_LABELS[a.status]}`}
          </span>
        </span>
      }
    >
      <div className="space-y-4">
        <div className="text-[15px]">
          <p>
            {fmtDate(a.startsAt, { weekday: "long", month: "long" })}, {fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}
          </p>
          <p className="text-soft">
            {a.location.name} · {APPOINTMENT_TYPE_LABELS[a.type]} · {a.consultant?.name ?? "Consulente da assegnare"}
          </p>
          {a.client && (
            <Link href={`/clienti/${a.client.id}`} className="mt-1 inline-block text-sm link-quiet">
              Scheda cliente {a.client.email && `· ${a.client.email}`} {a.client.phone && `· ${a.client.phone}`}
            </Link>
          )}
          {a.notes && <p className="mt-2 whitespace-pre-line rounded-2xl bg-selected px-4 py-3 text-sm text-soft">{a.notes}</p>}
          <div className="mt-2">
            <Badge tone={a.status === "CONFERMATO" ? "success" : "outline"}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>
          </div>
        </div>
        {Array.isArray(a.history) && a.history.length > 0 && (
          <div>
            <p className="eyebrow mb-1">Storico modifiche</p>
            {(a.history as { from: string; to: string; at: string; by: string }[]).map((h, i) => (
              <p key={i} className="text-xs text-muted">
                {fmtDateTime(h.from)} → {fmtDateTime(h.to)} · {h.by}
              </p>
            ))}
          </div>
        )}
        {canEdit && a.status === "CONFERMATO" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton action={setAppointmentStatus.bind(null, a.id, "COMPLETATO")} variant="secondary" size="md">
                Completato
              </ActionButton>
              <ActionButton action={setAppointmentStatus.bind(null, a.id, "ANNULLATO")} variant="danger" size="md" confirm="Annullare l'appuntamento?">
                Annulla
              </ActionButton>
            </div>
            <div className="border-t border-line pt-4">
              <p className="eyebrow mb-3">Riprogramma</p>
              <AppointmentForm
                action={rescheduleAppointment.bind(null, a.id)}
                locations={locations}
                consultants={consultants}
                values={{
                  locationId: a.locationId,
                  consultantId: a.consultantId,
                  type: a.type,
                  day: dayKey(a.startsAt, a.location.timezone),
                  time: minutesToHHMM(minutesOfDay(a.startsAt, a.location.timezone)),
                  duration: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60000),
                  notes: a.notes,
                }}
              />
            </div>
          </>
        )}
      </div>
    </ModalButton>
  );

  return (
    <div className="animate-fadein">
      <PageHeader
        eyebrow="05 / Agenda"
        title="Time well spent."
        subtitle="Appuntamenti, consulenze e visite in showroom."
        actions={
          canEdit && (
            <ModalButton label={<><Plus size={15} /> Nuovo appuntamento</>} title="Nuovo appuntamento" className={buttonClass("primary", "sm")} defaultOpen={sp.nuovo === "1"}>
              <AppointmentForm
                action={createAppointment}
                clients={clients}
                locations={locations}
                consultants={consultants}
                values={{ clientId: sp.cliente, locationId: sp.sede ?? user.defaultLocationId, day: day < today ? today : day }}
                isNew
                emailEnabled={email}
              />
            </ModalButton>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-full bg-selected p-1 text-sm">
          {[
            ["giorno", "Giorno"],
            ["settimana", "Settimana"],
            ["prossimi", "Prossimi"],
            ["storico", "Storico"],
          ].map(([k, l]) => (
            <Link key={k} href={link({ vista: k })} className={cn("flex-1 rounded-full px-4 py-2 text-center", vista === k ? "bg-white shadow-sm" : "text-soft")}>
              {l}
            </Link>
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Link href={link({ sede: null })} className={cn("chip", !sp.sede && "chip-active")}>
            Tutte le sedi
          </Link>
          {locations.map((l) => (
            <Link key={l.id} href={link({ sede: l.id })} className={cn("chip", sp.sede === l.id && "chip-active")}>
              {l.name}
            </Link>
          ))}
        </div>
      </div>

      {(vista === "giorno" || vista === "settimana") && (
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Link href={link({ giorno: addDays(day, -step) })} className="rounded-full p-2 hover:bg-selected" aria-label="Precedente">
              <ChevronLeft size={20} />
            </Link>
            <Link href={link({ giorno: addDays(day, step) })} className="rounded-full p-2 hover:bg-selected" aria-label="Successivo">
              <ChevronRight size={20} />
            </Link>
            <h2 className="ml-2 text-xl capitalize">
              {vista === "giorno"
                ? fmtDate(zonedToUtc(day, 720, TZ), { weekday: "long", month: "long" })
                : `${fmtDate(zonedToUtc(weekStart, 720, TZ), { year: undefined })} – ${fmtDate(zonedToUtc(addDays(weekStart, 6), 720, TZ))}`}
            </h2>
          </div>
          {day !== today && (
            <Link href={link({ giorno: today })} className="chip">
              Oggi
            </Link>
          )}
        </div>
      )}

      {vista === "settimana" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
            const items = appointments.filter((a) => dayKey(a.startsAt, TZ) === d);
            return (
              <div key={d} className={cn("min-h-[120px] rounded-2xl border p-2", d === today ? "border-ink/40 bg-white" : "border-line")}>
                <Link href={link({ vista: "giorno", giorno: d })} className="mb-2 block px-1 text-sm capitalize text-soft hover:text-ink">
                  {fmtDate(zonedToUtc(d, 720, TZ), { weekday: "short", month: undefined, year: undefined })}
                </Link>
                <div className="space-y-2">{items.map((a) => card(a, true))}</div>
              </div>
            );
          })}
        </div>
      ) : appointments.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-lg">Nessun appuntamento</p>
          <p className="mt-1 text-sm text-soft">{vista === "giorno" ? "Giornata libera." : "Nessun appuntamento nel periodo."}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">{appointments.map((a) => card(a))}</div>
      )}

      <div className="mt-10 card p-5">
        <p className="eyebrow mb-2">Prenotazione online per i clienti</p>
        <p className="text-sm text-soft">Condividi il link dello showroom: le prenotazioni compaiono automaticamente in agenda.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {locations.filter((l) => l.bookingEnabled).map((l) => (
            <a key={l.id} href={`/book/${l.slug}`} target="_blank" className="chip">
              /book/{l.slug} <ExternalLink size={13} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
