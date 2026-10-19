import type { RoleKey } from "@prisma/client";

/**
 * Role-based permissions. Checked on the server in every action and route;
 * the UI only uses them to hide controls the user could not use anyway.
 */
export const PERMISSIONS = [
  "product:view",
  "product:edit",
  "price:view",
  "document:view",
  "document:manage",
  "document:confidential",
  "inventory:view",
  "inventory:edit",
  "inventory:reserve",
  "client:view",
  "client:edit",
  "quote:view",
  "quote:edit",
  "email:send",
  "appointment:view",
  "appointment:edit",
  "task:edit",
  "ai:use",
  "admin:access",
  "admin:users",
  "admin:settings",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const SALES: Permission[] = [
  "product:view",
  "price:view",
  "document:view",
  "inventory:view",
  "inventory:reserve",
  "client:view",
  "client:edit",
  "quote:view",
  "quote:edit",
  "email:send",
  "appointment:view",
  "appointment:edit",
  "task:edit",
  "ai:use",
];

const MANAGER: Permission[] = [
  ...SALES,
  "product:edit",
  "document:manage",
  "document:confidential",
  "inventory:edit",
  "admin:access",
  "audit:view",
];

const WAREHOUSE: Permission[] = [
  "product:view",
  "document:view",
  "inventory:view",
  "inventory:edit",
  "appointment:view",
  "task:edit",
  "ai:use",
];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER,
  SALES,
  WAREHOUSE,
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: "Amministratore",
  MANAGER: "Manager",
  SALES: "Consulente vendite",
  WAREHOUSE: "Magazzino",
};

export function can(role: RoleKey, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
