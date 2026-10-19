import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./auth";
import { can } from "./permissions";

/** Prisma filter hiding confidential documents (e.g. price lists) from unauthorised roles. */
export function visibleDocuments(user: SessionUser): Prisma.DocumentWhereInput {
  return can(user.role, "document:confidential") ? {} : { confidential: false };
}
