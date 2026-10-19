"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { LocationType, RoleKey } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser, hashPassword } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { fetchLiveRate, getSetting, setSetting } from "@/lib/settings";
import { storeImage } from "@/lib/storage";
import { hhmmToMinutes } from "@/lib/time";
import { optStr, slugify, str } from "@/lib/utils";

const ROLES = ["ADMIN", "MANAGER", "SALES", "WAREHOUSE"] as const;

// ── Users ──────────────────────────────────────────────────

export async function createUser(form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:users");
    const data = z
      .object({
        name: z.string().min(1, "Inserisci il nome."),
        email: z.string().email("Email non valida."),
        roleKey: z.enum(ROLES),
        password: z.string().min(10, "La password deve avere almeno 10 caratteri."),
        defaultLocationId: z.string().nullable(),
      })
      .parse({ name: str(form, "name"), email: str(form, "email").toLowerCase(), roleKey: str(form, "roleKey"), password: str(form, "password"), defaultLocationId: optStr(form, "defaultLocationId") });
    const u = await db.user.create({
      data: { name: data.name, email: data.email, roleKey: data.roleKey, defaultLocationId: data.defaultLocationId, passwordHash: await hashPassword(data.password) },
    });
    await audit(admin.id, "user.create", "User", u.id, `Creato utente ${u.email} (${u.roleKey})`);
    revalidatePath("/admin/utenti");
  }, "Utente creato.");
}

export async function updateUser(id: string, form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:users");
    const roleKey = str(form, "roleKey") as RoleKey;
    if (!ROLES.includes(roleKey as (typeof ROLES)[number])) throw new AppError("Ruolo non valido.");
    const active = str(form, "active") === "1";
    if (id === admin.id && (roleKey !== "ADMIN" || !active)) throw new AppError("Non puoi rimuovere i tuoi permessi di amministratore.");
    const password = str(form, "password");
    if (password && password.length < 10) throw new AppError("La password deve avere almeno 10 caratteri.");
    const u = await db.user.update({
      where: { id },
      data: {
        name: str(form, "name") || undefined,
        roleKey,
        active,
        phone: optStr(form, "phone"),
        defaultLocationId: optStr(form, "defaultLocationId"),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    if (!active || password) await db.session.deleteMany({ where: { userId: id } });
    await audit(admin.id, "user.update", "User", id, `Aggiornato utente ${u.email}: ${roleKey}${active ? "" : ", disattivato"}${password ? ", password reimpostata" : ""}`);
    revalidatePath("/admin/utenti");
  }, "Utente aggiornato.");
}

// ── Locations, zones, availability ─────────────────────────

export async function saveLocation(id: string | null, form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    const name = str(form, "name");
    if (!name) throw new AppError("Inserisci il nome della sede.");
    const tz = str(form, "timezone") || "Europe/Zurich";
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch {
      throw new AppError("Fuso orario non valido (es. Europe/Zurich).");
    }
    const data = {
      name,
      slug: slugify(str(form, "slug") || name),
      type: (str(form, "type") || "SHOWROOM") as LocationType,
      city: str(form, "city") || name,
      country: str(form, "country"),
      address: optStr(form, "address"),
      phone: optStr(form, "phone"),
      email: optStr(form, "email"),
      timezone: tz,
      bookingEnabled: str(form, "bookingEnabled") === "1",
      active: id ? str(form, "active") === "1" : true,
      sortOrder: Number(str(form, "sortOrder") || 0),
    };
    const l = id ? await db.location.update({ where: { id }, data }) : await db.location.create({ data });
    await audit(admin.id, id ? "location.update" : "location.create", "Location", l.id, `Sede ${l.name}`);
    revalidatePath("/admin/sedi");
  }, "Sede salvata.");
}

export async function addZone(locationId: string, form: FormData) {
  return run(async () => {
    await assertUser("admin:settings");
    const name = str(form, "name");
    if (!name) throw new AppError("Inserisci il nome della zona.");
    await db.zone.create({ data: { locationId, name } });
    revalidatePath("/admin/sedi");
  }, "Zona aggiunta.");
}

export async function deleteZone(id: string) {
  return run(async () => {
    await assertUser("admin:settings");
    await db.zone.delete({ where: { id } });
    revalidatePath("/admin/sedi");
  }, "Zona eliminata.");
}

export async function addAvailability(form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    const userId = str(form, "userId");
    const locationId = str(form, "locationId");
    const start = hhmmToMinutes(str(form, "start") || "10:00");
    const end = hhmmToMinutes(str(form, "end") || "18:00");
    const weekdays = form.getAll("weekday").map(Number).filter((n) => n >= 1 && n <= 7);
    if (!userId || !locationId || !weekdays.length) throw new AppError("Seleziona consulente, sede e giorni.");
    if (end <= start) throw new AppError("L'orario di fine deve seguire l'inizio.");
    await db.consultantAvailability.createMany({ data: weekdays.map((weekday) => ({ userId, locationId, weekday, startMinute: start, endMinute: end })) });
    await audit(admin.id, "availability.create", "ConsultantAvailability", null, `Disponibilità aggiunta (${weekdays.length} giorni)`);
    revalidatePath("/admin/sedi");
  }, "Disponibilità salvata.");
}

export async function deleteAvailability(id: string) {
  return run(async () => {
    await assertUser("admin:settings");
    await db.consultantAvailability.delete({ where: { id } });
    revalidatePath("/admin/sedi");
  }, "Fascia eliminata.");
}

// ── Catalogue vocabulary ───────────────────────────────────

export async function saveBrand(id: string | null, form: FormData) {
  return run(async () => {
    const admin = await assertUser("product:edit");
    const name = str(form, "name");
    if (!name) throw new AppError("Inserisci il nome del brand.");
    const data = { name, website: optStr(form, "website"), country: optStr(form, "country") };
    const b = id ? await db.brand.update({ where: { id }, data }) : await db.brand.create({ data });
    await audit(admin.id, "brand.save", "Brand", b.id, `Brand ${b.name}`);
    revalidatePath("/admin/catalogo");
  }, "Brand salvato.");
}

export async function saveCategory(id: string | null, form: FormData) {
  return run(async () => {
    await assertUser("product:edit");
    const name = str(form, "name");
    if (!name) throw new AppError("Inserisci il nome della categoria.");
    const data = { name, slug: slugify(name) };
    if (id) await db.category.update({ where: { id }, data });
    else await db.category.create({ data });
    revalidatePath("/admin/catalogo");
  }, "Categoria salvata.");
}

export async function saveMaterial(form: FormData) {
  return run(async () => {
    await assertUser("product:edit");
    const name = str(form, "name");
    if (!name) throw new AppError("Inserisci il nome del materiale.");
    await db.material.create({ data: { name, type: str(form, "type") || "Altro", brandId: optStr(form, "brandId") } });
    revalidatePath("/admin/catalogo");
  }, "Materiale salvato.");
}

export async function addFinish(materialId: string, form: FormData) {
  return run(async () => {
    await assertUser("product:edit");
    const name = str(form, "name");
    const hex = str(form, "hexColor") || "#CCCCCC";
    if (!name) throw new AppError("Inserisci il nome della finitura.");
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new AppError("Colore non valido.");
    await db.finish.create({ data: { materialId, name, hexColor: hex, code: optStr(form, "code") } });
    revalidatePath("/admin/catalogo");
  }, "Finitura aggiunta.");
}

export async function deleteFinish(id: string) {
  return run(async () => {
    await assertUser("product:edit");
    await db.finish.delete({ where: { id } });
    revalidatePath("/admin/catalogo");
  }, "Finitura eliminata.");
}

// ── Settings ───────────────────────────────────────────────

export async function setManualRate(form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    const rate = Number(str(form, "eurToChf").replace(",", "."));
    if (!(rate > 0.3 && rate < 3)) throw new AppError("Tasso non plausibile.");
    await setSetting("exchangeRate", { eurToChf: rate, source: "MANUALE", updatedAt: new Date().toISOString() });
    await audit(admin.id, "settings.rate", "Setting", "exchangeRate", `Cambio manuale 1 EUR = ${rate} CHF`);
    revalidatePath("/admin/impostazioni");
  }, "Cambio aggiornato (manuale).");
}

export async function refreshLiveRate() {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    let live;
    try {
      live = await fetchLiveRate();
    } catch (e) {
      throw new AppError(`Impossibile ottenere il tasso BCE: ${(e as Error).message}. Il cambio attuale resta invariato.`);
    }
    await setSetting("exchangeRate", live);
    await audit(admin.id, "settings.rate", "Setting", "exchangeRate", `Cambio BCE ${live.referenceDate}: 1 EUR = ${live.eurToChf} CHF`);
    revalidatePath("/admin/impostazioni");
  }, "Tasso BCE verificato e applicato.");
}

export async function saveEmailSettings(form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    const replyTo = str(form, "replyTo");
    if (replyTo && !z.string().email().safeParse(replyTo).success) throw new AppError("Indirizzo di risposta non valido.");
    await setSetting("email", { signature: str(form, "signature"), replyTo });
    await audit(admin.id, "settings.email", "Setting", "email", "Aggiornate impostazioni email");
    revalidatePath("/admin/impostazioni");
  }, "Impostazioni email salvate.");
}

export async function uploadHero(form: FormData) {
  return run(async () => {
    const admin = await assertUser("admin:settings");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Seleziona un'immagine.");
    const stored = await storeImage(file, "site");
    const site = await getSetting<Record<string, unknown>>("site", {});
    await setSetting("site", { ...site, heroImageKey: stored.key, heroCredit: str(form, "credit") || null });
    await audit(admin.id, "settings.hero", "Setting", "site", "Aggiornata immagine di copertina");
    revalidatePath("/", "layout");
  }, "Immagine di copertina aggiornata.");
}
