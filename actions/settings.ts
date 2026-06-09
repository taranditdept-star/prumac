"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

export type ActionResult = { error: string } | { success: true };

/** Update operational thresholds (admin only). */
export async function updateThresholds(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("admin");

  const n = Number(formData.get("odometer_jump_threshold_km"));
  if (!Number.isFinite(n) || n < 0 || n > 100000) {
    return { error: "Enter a valid odometer jump threshold (0–100000 km)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("app_settings")
    .upsert(
      {
        key: "odometer_jump_threshold_km",
        value: n,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Publish a new version of the active trip Terms (admin only). Supersede model:
 * deactivate the current active trip_terms, then insert a new active row at
 * version+1. Drivers re-accept on their next trip.
 */
export async function publishTerms(formData: FormData): Promise<ActionResult> {
  await requireRole("admin");

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body_md") ?? "").trim();
  if (body.length < 10) return { error: "Terms text is too short." };

  const supabase = await createClient();

  const { data: current } = await supabase
    .schema("app")
    .from("agreements")
    .select("id, version")
    .eq("kind", "trip_terms")
    .eq("is_active", true)
    .maybeSingle<{ id: string; version: number }>();

  if (current) {
    const { error: deErr } = await supabase
      .schema("app")
      .from("agreements")
      .update({ is_active: false })
      .eq("id", current.id);
    if (deErr) return { error: deErr.message };
  }

  const nextVersion = (current?.version ?? 0) + 1;
  const { error: insErr } = await supabase
    .schema("app")
    .from("agreements")
    .insert({
      kind: "trip_terms",
      version: nextVersion,
      title: title || "PRUMAC Vehicle-Use Agreement & Privacy Notice",
      body_md: body,
      is_active: true,
    });

  if (insErr) {
    // Best-effort rollback: re-activate the previous version.
    if (current) {
      await supabase.schema("app").from("agreements").update({ is_active: true }).eq("id", current.id);
    }
    return { error: insErr.message };
  }

  revalidatePath("/settings");
  return { success: true };
}
