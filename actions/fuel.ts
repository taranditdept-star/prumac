"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { fuelLogSchema, fuelCardSchema } from "@/lib/validation/fuel";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v == null || v === "" ? null : String(v);
}

export async function createFuelLog(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = fuelLogSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    driver_id: s(formData, "driver_id"),
    trip_id: s(formData, "trip_id"),
    fuel_card_id: s(formData, "fuel_card_id"),
    filled_at: formData.get("filled_at"),
    odometer_km: s(formData, "odometer_km"),
    litres: formData.get("litres"),
    price_per_litre: s(formData, "price_per_litre"),
    total_cost: formData.get("total_cost"),
    currency: formData.get("currency") || "USD",
    is_full_tank: formData.get("is_full_tank") === "on" || formData.get("is_full_tank") === "true",
    station: s(formData, "station"),
    payment_method: s(formData, "payment_method"),
    receipt_path: s(formData, "receipt_path"),
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("fuel_logs")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  // Best-effort anomaly scan so a suspicious fill surfaces immediately.
  await supabase.schema("app").rpc("fn_scan_fuel_anomalies", { p_lookback_days: 60 });

  revalidatePath("/fuel");
  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  redirect("/fuel");
}

export async function createFuelCard(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireRole("fleet_manager", "admin");

  const parsed = fuelCardSchema.safeParse({
    card_number: formData.get("card_number"),
    provider: s(formData, "provider"),
    assigned_vehicle_id: s(formData, "assigned_vehicle_id"),
    is_active: formData.get("is_active") !== "false",
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.schema("app").from("fuel_cards").insert(parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/fuel");
  return { success: true };
}
