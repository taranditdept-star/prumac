"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

export type ActionResult = { error: string } | { success: true };

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: profile.id,
    })
    .eq("id", alertId)
    .is("acknowledged_at", null);
  if (error) return { error: error.message };
  revalidatePath("/live");
  revalidatePath("/live/map");
  return { success: true };
}

export async function resolveAlert(alertId: string, notes?: string): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
      resolved_notes: notes ?? null,
    })
    .eq("id", alertId);
  if (error) return { error: error.message };
  revalidatePath("/live");
  revalidatePath("/live/map");
  return { success: true };
}

export async function scanAlerts(): Promise<ActionResult & { count?: number }> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("fn_scan_document_expiries");
  if (error) return { error: error.message };
  revalidatePath("/live");
  revalidatePath("/live/map");
  return { success: true, count: typeof data === "number" ? data : 0 };
}

/**
 * Records that a manager has looked at a flagged trip and is happy with it.
 *
 * The two decision buttons on the reconciliation detail page did nothing at
 * all — a manager could press "Accept as-is" on a 20%-variance trip and the
 * system kept flagging it forever, because reconciliations rows are recomputed
 * and carry no reviewed state.
 *
 * The alert IS the outstanding item, so resolving it is the honest record of
 * the decision: it clears from the bell and the live board, and stays
 * attributed to whoever accepted it. The reconciliation row is untouched, so
 * the underlying variance is never rewritten to look better than it was.
 */
export async function acceptReconciliation(
  tripId: string,
  note?: string,
): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: open, error: findErr } = await supabase
    .schema("app")
    .from("alerts")
    .select("id")
    .eq("trip_id", tripId)
    .like("kind", "reconciliation%")
    .is("resolved_at", null)
    .returns<{ id: string }[]>();
  if (findErr) return { error: findErr.message };
  if (!open || open.length === 0) {
    return { error: "There is nothing outstanding on this trip to accept." };
  }

  const { error } = await supabase
    .schema("app")
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: profile.id,
      resolved_notes: note?.trim() || "Variance reviewed and accepted as recorded.",
    })
    .in("id", open.map((a) => a.id));
  if (error) return { error: error.message };

  revalidatePath(`/reconciliation/${tripId}`);
  revalidatePath("/reconciliation");
  revalidatePath("/live");
  return { success: true };
}
