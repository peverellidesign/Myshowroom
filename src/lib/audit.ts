import type { Prisma } from "@prisma/client";
import { db, type Tx as DbTx } from "./db";

type Tx = DbTx | typeof db;

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  details?: Prisma.InputJsonValue,
  tx: Tx = db,
) {
  await tx.auditLog.create({ data: { userId, action, entity, entityId, summary, details } });
}
