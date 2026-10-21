import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { APPOINTMENT_TYPE_LABELS } from "@/lib/format";
import { addDays, dayKey, isoWeekday, zonedToUtc } from "@/lib/time";
import { Brand } from "@/components/brand";
import { BookingFlow } from "../booking-flow";

export async function generateMetadata({ params }: { params: Promise<{ location: string }> }) {
  const { location } = await params;
  const l = await db.location.findFirst({ where: { slug: location } });
  return { title: l ? `Prenota a ${l.name}` : "Prenota" };
}

export default async function PublicBookingPage({ params }: { params: Promise<{ location: string }> }) {
  const { location: slug } = await params;
  const location = await db.location.findFirst({ where: { slug, bookingEnabled: true, active: true } });
  if (!location) notFound();
  const weekdays = new Set((await db.consultantAvailability.findMany({ where: { locationId: location.id }, select: { weekday: true } })).map((a) => a.weekday));
  const today = dayKey(new Date(), location.timezone);
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i)).map((d) => {
    const noon = zonedToUtc(d, 720, location.timezone);
    return {
      key: d,
      weekday: noon.toLocaleDateString("it-IT", { weekday: "short", timeZone: location.timezone }).replace(".", ""),
      label: noon.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: location.timezone }),
      open: weekdays.has(isoWeekday(d)),
    };
  });
  const others = await db.location.findMany({ where: { bookingEnabled: true, active: true, id: { not: location.id } }, orderBy: { sortOrder: "asc" } });

  return (
    <main className="min-h-dvh">
      <div className="relative h-[34vh] min-h-[220px] overflow-hidden bg-mist">
        <img src="/api/public/hero" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="mx-auto -mt-10 max-w-2xl px-4 pb-16">
        <div className="card relative p-6 sm:p-8">
          <Brand />
          <p className="eyebrow mt-8">Showroom {location.name}</p>
          <h1 className="h-display mt-2">Prenota la tua consulenza.</h1>
          <p className="mt-2 text-[17px] text-soft">{location.address ?? location.city}</p>
          <div className="mt-8">
            <BookingFlow slug={location.slug} locationName={location.name} types={Object.entries(APPOINTMENT_TYPE_LABELS)} days={days} />
          </div>
        </div>
        {others.length > 0 && (
          <p className="mt-6 text-center text-sm text-soft">
            Altri showroom:{" "}
            {others.map((o, i) => (
              <span key={o.id}>
                {i > 0 && " · "}
                <Link href={`/book/${o.slug}`} className="link-quiet">
                  {o.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </main>
  );
}
