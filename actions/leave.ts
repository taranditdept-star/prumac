"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/session";
import { leaveRequestSchema, leaveReviewSchema } from "@/lib/validation/leave";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v == null || v === "" ? null : String(v);
}

/** Driver (or manager on behalf) files a leave request. */
export async function requestLeave(formData: FormData): Promise<ActionResult> {
  const profile = await requireAuth();
  const supabase = await createClient();

  const parsed = leaveRequestSchema.safeParse({
    driver_id: s(formData, "driver_id"),
    leave_type: formData.get("leave_type") || "annual",
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    reason: s(formData, "reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Resolve which driver this is for.
  let driverId = parsed.data.driver_id ?? null;
  const isManager = profile.role === "fleet_manager" || profile.role === "admin";
  if (!driverId) {
    if (isManager) return { error: "Select a driver for the leave request." };
    const { data: driver } = await supabase
      .schema("app")
      .from("drivers")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle<{ id: string }>();
    if (!driver) return { error: "No driver profile found for your account." };
    driverId = driver.id;
  } else if (!isManager) {
    return { error: "You can only file leave for yourself." };
  }

  const { error } = await supabase
    .schema("app")
    .from("driver_leave")
    .insert({
      driver_id: driverId,
      leave_type: parsed.data.leave_type,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      reason: parsed.data.reason,
      requested_by: profile.id,
    });
  if (error) return { error: error.message };

  revalidatePath("/leave");
  return { success: true };
}

/** Driver cancels their own still-pending request. */
export async function cancelLeave(formData: FormData): Promise<ActionResult> {
  await requireAuth();
  const leaveId = String(formData.get("leave_id") ?? "");
  if (!leaveId) return { error: "Missing request id." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("driver_leave")
    .update({ status: "cancelled" })
    .eq("id", leaveId)
    .eq("status", "pending"); // RLS limits to own rows
  if (error) return { error: error.message };

  revalidatePath("/leave");
  return { success: true };
}

/** Manager approves or rejects a request. */
export async function reviewLeave(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = leaveReviewSchema.safeParse({
    leave_id: formData.get("leave_id"),
    decision: formData.get("decision"),
    review_notes: s(formData, "review_notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("driver_leave")
    .update({
      status: parsed.data.decision,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.data.review_notes,
    })
    .eq("id", parsed.data.leave_id)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/leave");
  return { success: true };
}
