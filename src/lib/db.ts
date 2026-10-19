import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

// Password hashes are omitted from every query by default (defence in depth):
// only the login flow opts back in explicitly.
function createClient() {
  return new PrismaClient({ omit: { user: { passwordHash: true } } });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Transaction client type matching our configured client (with the default omit). */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
