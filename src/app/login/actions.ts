"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Simple in-memory throttle per email to slow down brute-force attempts.
const attempts = new Map<string, { n: number; until: number }>();

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse({ email: String(form.get("email") ?? "").toLowerCase().trim(), password: form.get("password") });
  if (!parsed.success) return { error: "Inserisci email e password." };
  const { email, password } = parsed.data;
  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { error: "Troppi tentativi. Riprova tra qualche minuto." };

  const user = await db.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(email, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Credenziali non valide." };
  }
  attempts.delete(email);
  await createSession(user.id);
  await audit(user.id, "auth.login", "User", user.id, `Accesso di ${user.name}`);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
