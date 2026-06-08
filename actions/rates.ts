"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { rateCreateSchema, rateUpdateSchema } from "@/lib/validation/rate";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

// ───────────────────────────────────────────────────────────────────────────
// CREATE a new billing rate (admin only)
// ───────────────────────────────────────────────────────────────────────────
export async function createRate(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("admin");

  const parsed = rateCreateSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    subsidiary_id: formData.get("subsidiary_id") || null,
    mode: formData.get("mode"),
    rate_amount: formData.get("rate_amount"),
    currency: formData.get("currency") || "USD",
    radius_km: formData.get("radius_km") || null,
    effective_from: formData.get("effective_from"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("billing_rates")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      subsidiary_id: parsed.data.subsidiary_id ?? null,
      mode: parsed.data.mode,
      rate_amount: parsed.data.rate_amount,
      currency: parsed.data.currency,
      radius_km: parsed.data.mode === "per_load" ? parsed.data.radius_km ?? null : null,
      effective_from: parsed.data.effective_from,
      notes: parsed.data.notes ?? null,
      created_by: profile.id,
    });

  if (error) return { error: error.message };

  revalidatePath("/rates");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// UPDATE a rate via SUPERSEDE (admin only)
//
// We never mutate a rate that may already have priced invoices. Instead the
// current rate is closed (effective_until = new effective_from) and a fresh
// effective-dated row is inserted carrying the new amount. Past invoices keep
// the price they were billed at; future trips use the new rate.
// ───────────────────────────────────────────────────────────────────────────
export async function updateRate(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("admin");

  const parsed = rateUpdateSchema.safeParse({
    rate_id: formData.get("rate_id"),
    rate_amount: formData.get("rate_amount"),
    currency: formData.get("currency") || "USD",
    radius_km: formData.get("radius_km") || null,
    effective_from: formData.get("effective_from"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // Load the rate being superseded.
  const { data: current, error: loadErr } = await supabase
    .schema("app")
    .from("billing_rates")
    .select("id, vehicle_id, subsidiary_id, mode, effective_from, effective_until")
    .eq("id", parsed.data.rate_id)
    .single<{
      id: string;
      vehicle_id: string;
      subsidiary_id: string | null;
      mode: string;
      effective_from: string;
      effective_until: string | null;
    }>();
  if (loadErr || !current) return { error: "Rate not found." };

  // The new period must start strictly after the current one began (the table's
  // rates_period_valid CHECK enforces effective_until > effective_from).
  if (parsed.data.effective_from <= current.effective_from) {
    return {
      error: `New effective date must be after the current rate's start (${current.effective_from}).`,
    };
  }
  if (current.effective_until && parsed.data.effective_from >= current.effective_until) {
    return { error: "This rate has already been superseded." };
  }

  const radius =
    current.mode === "per_load" ? parsed.data.radius_km ?? null : null;
  if (current.mode === "per_load" && radius == null) {
    return { error: "Radius (km) is required for per-load rates." };
  }

  // 1) Close the current rate at the new boundary.
  const { error: closeErr } = await supabase
    .schema("app")
    .from("billing_rates")
    .update({ effective_until: parsed.data.effective_from })
    .eq("id", current.id);
  if (closeErr) return { error: closeErr.message };

  // 2) Insert the superseding rate, open-ended.
  const { error: insErr } = await supabase
    .schema("app")
    .from("billing_rates")
    .insert({
      vehicle_id: current.vehicle_id,
      subsidiary_id: current.subsidiary_id,
      mode: current.mode,
      rate_amount: parsed.data.rate_amount,
      currency: parsed.data.currency,
      radius_km: radius,
      effective_from: parsed.data.effective_from,
      notes: parsed.data.notes ?? null,
      created_by: profile.id,
    });
  if (insErr) {
    // Roll back the close so we don't strand the vehicle without a rate.
    await supabase
      .schema("app")
      .from("billing_rates")
      .update({ effective_until: current.effective_until })
      .eq("id", current.id);
    return { error: insErr.message };
  }

  revalidatePath("/rates");
  return { success: true };
}
