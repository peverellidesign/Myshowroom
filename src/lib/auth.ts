import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import type { RoleKey } from "@prisma/client";
import { db } from "./db";
import { can, type Permission } from "./permissions";
import { ForbiddenError } from "./errors";

export const SESSION_COOKIE = "ms_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  defaultLocationId: string | null;
  activeQuotationId: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 250) ?? null;
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.roleKey,
    defaultLocationId: u.defaultLocationId,
    activeQuotationId: u.activeQuotationId,
  };
});

/** For pages: redirect to login when not authenticated. */
export async function requireUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission)) redirect("/?negato=1");
  return user;
}

/** For server actions / API routes: throw when not allowed. */
export async function assertUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError("Sessione scaduta. Accedi di nuovo.");
  if (permission && !can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export function userCan(user: SessionUser, permission: Permission) {
  return can(user.role, permission);
}
