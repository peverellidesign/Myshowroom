import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

/** Wraps a server action body, converting known errors to a user-facing Italian message. */
export async function run<T>(fn: () => Promise<T | void>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = (await fn()) ?? undefined;
    return { ok: true, message, data: data as T | undefined };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Dati non validi.";
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "Esiste già un elemento con questi dati univoci.";
    if (e.code === "P2003") return "Elemento collegato ad altri dati: impossibile completare.";
    if (e.code === "P2025") return "Elemento non trovato.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("RESERVATION_CAPACITY_EXCEEDED")) return "Quantità non disponibile: il pezzo è già riservato.";
  if (msg.includes("INVENTORY_NOT_RESERVABLE")) return "Questo pezzo non è riservabile nel suo stato attuale.";
  if (msg.includes("appointment_no_consultant_overlap")) return "Il consulente ha già un appuntamento in questo orario.";
  // Next.js redirect/notFound must propagate.
  if (msg === "NEXT_REDIRECT" || msg === "NEXT_NOT_FOUND") throw e;
  console.error(e);
  return "Si è verificato un errore imprevisto. Riprova.";
}
