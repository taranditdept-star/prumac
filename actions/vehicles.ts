"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { vehicleSchema, vehicleUpdateSchema } from "@/lib/validation/vehicle";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

/** Create a new vehicle. Ops/admin only. */
export async function createVehicle(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireRole("fleet_manager", "admin");

  const raw = formDataToVehicleObject(formData);
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("vehicles")
    .insert(parsed.data)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") return { error: "A vehicle with this plate number already exists." };
    return { error: error.message };
  }

  revalidatePath("/vehicles");
  redirect(`/vehicles/${data.id}`);
}

/** Update an existing vehicle. */
export async function updateVehicle(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");

  const raw = { ...formDataToVehicleObject(formData), id: formData.get("id") as string };
  const parsed = vehicleUpdateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("vehicles")
    .update(fields)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/vehicles/${id}`);
  revalidatePath("/vehicles");
  return { success: true };
}

/** Decommission a vehicle — sets status + decommissioned_at. */
export async function decommissionVehicle(
  vehicleId: string,
  reason: string,
): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("vehicles")
    .update({
      status: "decommissioned",
      decommissioned_at: new Date().toISOString().split("T")[0],
      decommission_reason: reason,
    })
    .eq("id", vehicleId);

  if (error) return { error: error.message };

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath("/vehicles");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Helpers

function formDataToVehicleObject(fd: FormData): Record<string, unknown> {
  return {
    plate_number: fd.get("plate_number"),
    plate_country: fd.get("plate_country"),
    make: fd.get("make"),
    model: fd.get("model"),
    variant: fd.get("variant") || null,
    year_of_manufacture: fd.get("year_of_manufacture")
      ? Number(fd.get("year_of_manufacture"))
      : null,
    colour: fd.get("colour") || null,
    class: fd.get("class"),
    fuel_type: fd.get("fuel_type"),
    fuel_tank_litres: fd.get("fuel_tank_litres") ? Number(fd.get("fuel_tank_litres")) : null,
    status: fd.get("status") || "available",
    home_branch: fd.get("home_branch") || null,
    default_subsidiary_id: fd.get("default_subsidiary_id") || null,
    current_odometer_km: fd.get("current_odometer_km")
      ? Number(fd.get("current_odometer_km"))
      : 0,
    vin: fd.get("vin") || null,
    engine_number: fd.get("engine_number") || null,
    service_interval_km: fd.get("service_interval_km")
      ? Number(fd.get("service_interval_km"))
      : 5000,
    condition_notes: fd.get("condition_notes") || null,
    acquired_at: fd.get("acquired_at") || null,
    purchase_cost: fd.get("purchase_cost") ? Number(fd.get("purchase_cost")) : null,
    purchase_currency: fd.get("purchase_currency") || "USD",
    salvage_value: fd.get("salvage_value") ? Number(fd.get("salvage_value")) : null,
    useful_life_years: fd.get("useful_life_years") ? Number(fd.get("useful_life_years")) : null,
    depreciation_method: fd.get("depreciation_method") || "straight_line",
  };
}
