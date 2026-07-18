"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

export type MarkAttendanceResult =
  | { error: string }
  | { success: true; markedAt: string; date: string; alreadyMarked: boolean };

/**
 * Mark the current user's attendance for today (local Africa/Harare day).
 * Idempotent — a repeat tap returns the original mark. The day boundary and
 * uniqueness are enforced server-side by fn_mark_attendance (SECURITY DEFINER).
 */
export async function markAttendance(): Promise<MarkAttendanceResult> {
  await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase.schema("app").rpc("fn_mark_attendance");
  if (error) return { error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { att_date: string; att_marked_at: string; att_already: boolean }
    | undefined;
  if (!row) return { error: "Could not mark attendance. Please try again." };

  // Refresh the surfaces that show attendance state.
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/attendance");

  return {
    success: true,
    markedAt: row.att_marked_at,
    date: row.att_date,
    alreadyMarked: row.att_already,
  };
}
