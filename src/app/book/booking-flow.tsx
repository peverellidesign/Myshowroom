"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { publicBooking } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Day = { key: string; weekday: string; label: string; open: boolean };

export function BookingFlow({ slug, locationName, types, days }: { slug: string; locationName: string; types: [string, string][]; days: Day[] }) {
  const [type, setType] = useState(types[0][0]);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; location: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!day) return;
    setLoading(true);
    setTime(null);
    fetch(`/api/public/slots?location=${slug}&day=${day}`)
      .then((r) => r.json())
      .then((j) => setSlots((j.slots ?? []).map((s: { time: string }) => s.time)))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [day, slug]);

  if (done) {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-charcoal text-white">
          <Check size={26} />
        </span>
        <h2 className="mt-5 text-2xl">Appuntamento confermato.</h2>
        <p className="mt-2 text-soft">
          Ti aspettiamo nello showroom di {done.location}, {done.when}.
        </p>
        <p className="mt-1 text-sm text-muted">Riceverai una conferma via email se il servizio è attivo. Per modifiche contatta lo showroom.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("slug", slug);
        fd.set("type", type);
        fd.set("day", day ?? "");
        fd.set("time", time ?? "");
        setError(null);
        start(async () => {
          const res = await publicBooking(fd);
          if (res.ok) setDone(res);
          else {
            setError(res.error);
            if (day) {
              const j = await fetch(`/api/public/slots?location=${slug}&day=${day}`).then((r) => r.json());
              setSlots((j.slots ?? []).map((s: { time: string }) => s.time));
            }
          }
        });
      }}
    >
      <section>
        <p className="eyebrow mb-3">1 · Tipo di consulenza</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={cn("rounded-2xl border bg-white px-4 py-3.5 text-left text-[15px]", type === k ? "border-ink" : "border-line")}>
              {l}
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="eyebrow mb-3">2 · Giorno</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              disabled={!d.open}
              onClick={() => setDay(d.key)}
              className={cn(
                "flex w-[72px] shrink-0 flex-col items-center rounded-2xl border py-3 text-sm disabled:opacity-35",
                day === d.key ? "border-charcoal bg-charcoal text-white" : "border-line bg-white",
              )}
            >
              <span className="text-xs uppercase tracking-wider opacity-70">{d.weekday}</span>
              <span className="text-lg">{d.label}</span>
            </button>
          ))}
        </div>
      </section>
      {day && (
        <section>
          <p className="eyebrow mb-3">3 · Orario</p>
          {loading ? (
            <Loader2 className="animate-spin text-soft" size={20} />
          ) : slots && slots.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {slots.map((s) => (
                <button key={s} type="button" onClick={() => setTime(s)} className={cn("rounded-full border py-2.5 text-[15px]", time === s ? "border-charcoal bg-charcoal text-white" : "border-line bg-white")}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-soft">Nessun orario disponibile in questo giorno. Prova un&apos;altra data.</p>
          )}
        </section>
      )}
      {time && (
        <section className="space-y-3">
          <p className="eyebrow mb-3">4 · I tuoi dati</p>
          <input name="name" placeholder="Nome e cognome" required className="field" autoComplete="name" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="email" type="email" placeholder="Email" required className="field" autoComplete="email" />
            <input name="phone" type="tel" placeholder="Telefono" className="field" autoComplete="tel" />
          </div>
          <textarea name="notes" placeholder="Raccontaci il tuo progetto (facoltativo)" className="field" rows={3} />
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <label className="flex items-start gap-3 px-1 text-sm text-soft">
            <input type="checkbox" name="privacy" value="1" required className="mt-0.5 h-5 w-5 accent-[#222]" />
            Acconsento al trattamento dei dati personali per la gestione dell&apos;appuntamento.
          </label>
          {error && <p className="px-1 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
            {pending && <Loader2 size={16} className="animate-spin" />}
            Conferma appuntamento a {locationName}
          </button>
        </section>
      )}
    </form>
  );
}
