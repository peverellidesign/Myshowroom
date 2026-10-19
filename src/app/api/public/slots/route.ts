import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { availableSlots } from "@/lib/booking";
import { minutesToHHMM } from "@/lib/time";

// Public: free time slots for a bookable showroom on a given day.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("location") ?? "";
  const day = url.searchParams.get("day") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  const location = await db.location.findFirst({ where: { slug, bookingEnabled: true, active: true } });
  if (!location) return NextResponse.json({ error: "Showroom non trovato" }, { status: 404 });
  const maxDay = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  if (day > maxDay) return NextResponse.json({ slots: [] });
  const slots = await availableSlots(location.id, day, 60);
  return NextResponse.json({ slots: slots.map((s) => ({ time: minutesToHHMM(s.minute) })) }, { headers: { "Cache-Control": "no-store" } });
}
