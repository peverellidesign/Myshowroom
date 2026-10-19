import Link from "next/link";
import { db } from "@/lib/db";
import { Brand } from "@/components/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prenota" };

export default async function BookIndex() {
  const locations = await db.location.findMany({ where: { bookingEnabled: true, active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-16">
      <Brand large />
      <h1 className="h-display mt-12">Prenota la tua consulenza.</h1>
      <p className="mt-2 text-soft">Scegli lo showroom.</p>
      <div className="mt-8 space-y-3">
        {locations.map((l) => (
          <Link key={l.id} href={`/book/${l.slug}`} className="card flex items-center justify-between p-5 text-lg hover:border-ink/25">
            {l.name} <span className="text-sm text-soft">{l.city}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
