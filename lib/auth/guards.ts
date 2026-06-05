import type { AppRole } from "@/types/domain";

export const DRIVER_ROLES: AppRole[] = ["driver"];
export const OPS_ROLES: AppRole[] = ["fleet_manager", "admin"];
export const BILLING_ROLES: AppRole[] = ["subsidiary_billing", "admin"];
export const ADMIN_ROLES: AppRole[] = ["admin"];

export function canAccessOps(role: AppRole): boolean {
  return OPS_ROLES.includes(role);
}

export function canAccessBilling(role: AppRole): boolean {
  return BILLING_ROLES.includes(role);
}

export function isAdmin(role: AppRole): boolean {
  return role === "admin";
}
