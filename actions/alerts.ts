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
