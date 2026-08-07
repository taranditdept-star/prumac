"use server";

import { requireRole } from "@/lib/auth/session";
import { getLoginDetail, type LoginDetail } from "@/lib/ops/login-activity";

/** Load one account's drill-down detail for the interactive login panel. */
export async function loadLoginDetail(profileId: string): Promise<LoginDetail> {
  await requireRole("fleet_manager", "admin");
  if (typeof profileId !== "string" || !profileId) {
    return { isDriver: false, phone: null, email: null, checkedInToday: false, vehicle: null, trips: [], trips30d: 0 };
  }
  return getLoginDetail(profileId);
}
