"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

export type AttendanceAdminResult = { error: string } | { success: true };

/**
 * Mark / clear someone else's attendance for a day. The role is asserted here AND
 * inside the SECURITY DEFINER RPC (app.attendance RLS has no manager write
 * policy). `date` is a local Africa/Harare YYYY-MM-DD; omit for today.
 */
export async function markAttendanceFor(profileId: string, date?: string): Promise<AttendanceAdminResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_admin_mark_attendance", {
    p_profile_id: profileId,
    p_date: date ?? null,
    p_note: "Marked by a manager",
  });
  if (error) return { error: error.message };
  revalidatePath("/attendance");
  revalidatePath("/live");
  return { success: true };
}

export async function clearAttendanceFor(profileId: string, date?: string): Promise<AttendanceAdminResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_admin_clear_attendance", {
    p_profile_id: profileId,
    p_date: date ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/attendance");
  revalidatePath("/live");
  return { success: true };
}
