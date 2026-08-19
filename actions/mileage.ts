"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import { mileageSchema } from "@/lib/validation/mileage";

export type MileageResult = { error: string } | { success: true; endOdometer: number };

/**
 * Log a COMPLETED trip's mileage in one go (clerk/manager data entry). Unlike
 * the live dispatch flow, there's no photo/checklist/terms gate — the driver
 * and subsidiary are derived from the vehicle. Bumps the vehicle's odometer so
 * the next entry auto-fills the new start reading.
 */
export async function logMileage(formData: FormData): Promise<MileageResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = mileageSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    driver_id: formData.get("driver_id"),
    occurred_on: formData.get("occurred_on"),
    origin_label: formData.get("origin_label") || null,
    destination_label: formData.get("destination_label") || null,
    route_description: formData.get("route_description") || null,
    purpose: formData.get("purpose") || "delivery",
    purpose_detail: formData.get("purpose_detail") || null,
    start_odometer_km: formData.get("start_odometer_km"),
    end_odometer_km: formData.get("end_odometer_km"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const service = createServiceClient();

  const { data: veh } = await service
    .schema("app")
    .from("vehicles")
    .select("default_subsidiary_id, current_odometer_km")
    .eq("id", d.vehicle_id)
    .maybeSingle<{ default_subsidiary_id: string | null; current_odometer_km: number | null }>();
  if (!veh) return { error: "Vehicle not found." };

  // The driver is chosen per trip (pre-filled with the vehicle's owner in the
  // form when it has one). Pool/shared vehicles have no fixed owner, so we no
  // longer require an assignment — we trust the picked driver (the trips FK
  // enforces it's a real driver).
  const { data: drv } = await service
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("id", d.driver_id)
    .maybeSingle<{ id: string }>();
  if (!drv) return { error: "Pick who drove this trip." };

  let subsidiaryId = veh.default_subsidiary_id;
  if (!subsidiaryId) {
    const { data: sub } = await service
      .schema("app")
      .from("subsidiaries")
      .select("id")
      .order("name")
      .limit(1)
      .maybeSingle<{ id: string }>();
    subsidiaryId = sub?.id ?? null;
  }
  if (!subsidiaryId) return { error: "No subsidiary is configured to bill against." };

  const started = `${d.occurred_on}T08:00:00+02:00`;
  const ended = `${d.occurred_on}T17:00:00+02:00`;

  const { error } = await service.schema("app").from("trips").insert({
    vehicle_id: d.vehicle_id,
    driver_id: d.driver_id,
    subsidiary_id: subsidiaryId,
    purpose: d.purpose,
    purpose_detail: d.purpose_detail ?? null,
    origin_label: d.origin_label ?? null,
    destination_label: d.destination_label ?? null,
    route_description: d.route_description ?? null,
    start_odometer_km: d.start_odometer_km,
    end_odometer_km: d.end_odometer_km,
    status: "completed",
    started_at: started,
    ended_at: ended,
    completed_at: ended,
    created_by: profile.id,
  });
  if (error) return { error: error.message };

  // Advance the vehicle's odometer (never lower it for a back-dated entry).
  if (d.end_odometer_km > (veh.current_odometer_km ?? 0)) {
    await service
      .schema("app")
      .from("vehicles")
      .update({ current_odometer_km: d.end_odometer_km })
      .eq("id", d.vehicle_id);
  }

  revalidatePath("/trips");
  revalidatePath("/live");
  return { success: true, endOdometer: d.end_odometer_km };
}
