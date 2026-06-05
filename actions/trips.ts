"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/session";
import {
  tripStartSchema,
  tripEndSchema,
  tripCancelSchema,
} from "@/lib/validation/trip";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

// ───────────────────────────────────────────────────────────────────────────
// START trip — driver picks vehicle, captures odometer, begins
// ───────────────────────────────────────────────────────────────────────────
export async function startTrip(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAuth();

  const parsed = tripStartSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    driver_id: formData.get("driver_id"),
    subsidiary_id: formData.get("subsidiary_id"),
    purpose: formData.get("purpose") || "delivery",
    route_description: formData.get("route_description") || null,
    origin_label: formData.get("origin_label") || null,
    destination_label: formData.get("destination_label") || null,
    start_odometer_km: formData.get("start_odometer_km"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .schema("app")
    .from("trips")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      driver_id: parsed.data.driver_id,
      subsidiary_id: parsed.data.subsidiary_id,
      purpose: parsed.data.purpose,
      route_description: parsed.data.route_description,
      origin_label: parsed.data.origin_label,
      destination_label: parsed.data.destination_label,
      start_odometer_km: parsed.data.start_odometer_km,
      status: "in_progress",
      started_at: nowIso,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "This vehicle or driver already has an open trip." };
    }
    return { error: error.message };
  }

  // Update vehicle status to on_trip
  await supabase
    .schema("app")
    .from("vehicles")
    .update({ status: "on_trip" })
    .eq("id", parsed.data.vehicle_id);

  revalidatePath("/trips");
  revalidatePath("/home");
  revalidatePath("/live");
  return { redirectTo: `/trips/${data.id}` };
}

// ───────────────────────────────────────────────────────────────────────────
// PAUSE / RESUME
// ───────────────────────────────────────────────────────────────────────────
export async function pauseTrip(tripId: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", tripId);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

export async function resumeTrip(tripId: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({ status: "in_progress", paused_at: null })
    .eq("id", tripId);
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// END trip — capture end odometer, status → ended
// ───────────────────────────────────────────────────────────────────────────
export async function endTrip(formData: FormData): Promise<ActionResult> {
  await requireAuth();

  const parsed = tripEndSchema.safeParse({
    trip_id: formData.get("trip_id"),
    end_odometer_km: formData.get("end_odometer_km"),
    fuel_litres: formData.get("fuel_litres") || null,
    fuel_amount: formData.get("fuel_amount") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: trip } = await supabase
    .schema("app")
    .from("trips")
    .select("vehicle_id, start_odometer_km")
    .eq("id", parsed.data.trip_id)
    .single<{ vehicle_id: string; start_odometer_km: number }>();

  if (!trip) return { error: "Trip not found" };

  if (parsed.data.end_odometer_km < trip.start_odometer_km) {
    return { error: "End odometer must be greater than or equal to start odometer." };
  }

  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      end_odometer_km: parsed.data.end_odometer_km,
      fuel_litres: parsed.data.fuel_litres ?? null,
      fuel_amount: parsed.data.fuel_amount ?? null,
    })
    .eq("id", parsed.data.trip_id);

  if (error) return { error: error.message };

  revalidatePath(`/trips/${parsed.data.trip_id}`);
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// COMPLETE trip — manager/admin only after post-trip checks.
// Also kicks off reconciliation via the SQL function.
// ───────────────────────────────────────────────────────────────────────────
export async function completeTrip(tripId: string): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");

  const supabase = await createClient();
  const { data: trip } = await supabase
    .schema("app")
    .from("trips")
    .select("vehicle_id, end_odometer_km")
    .eq("id", tripId)
    .single<{ vehicle_id: string; end_odometer_km: number | null }>();
  if (!trip) return { error: "Trip not found" };
  if (trip.end_odometer_km == null) {
    return { error: "Trip cannot be completed without an end odometer." };
  }

  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", tripId);
  if (error) return { error: error.message };

  // Run reconciliation — best effort. Errors are non-fatal: manager can
  // re-run from the reconciliation review page.
  const { error: recErr } = await supabase
    .schema("app")
    .rpc("fn_reconcile_trip", { p_trip_id: tripId });
  if (recErr) {
    console.error("Reconciliation failed for trip", tripId, recErr.message);
  }

  // Free up the vehicle
  await supabase
    .schema("app")
    .from("vehicles")
    .update({ status: "available" })
    .eq("id", trip.vehicle_id);

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/reconciliation");
  revalidatePath("/live");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// RECONCILE — re-run the engine for a trip (e.g. after late GPS pings arrive)
// ───────────────────────────────────────────────────────────────────────────
export async function reconcileTrip(tripId: string): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_reconcile_trip", { p_trip_id: tripId });
  if (error) return { error: error.message };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/reconciliation/${tripId}`);
  revalidatePath("/reconciliation");
  return { success: true };
}

// ───────────────────────────────────────────────────────────────────────────
// CANCEL
// ───────────────────────────────────────────────────────────────────────────
export async function cancelTrip(formData: FormData): Promise<ActionResult> {
  await requireAuth();
  const parsed = tripCancelSchema.safeParse({
    trip_id: formData.get("trip_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: trip } = await supabase
    .schema("app")
    .from("trips")
    .select("vehicle_id")
    .eq("id", parsed.data.trip_id)
    .single<{ vehicle_id: string }>();
  if (!trip) return { error: "Trip not found" };

  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.trip_id);

  if (error) return { error: error.message };

  await supabase
    .schema("app")
    .from("vehicles")
    .update({ status: "available" })
    .eq("id", trip.vehicle_id);

  revalidatePath(`/trips/${parsed.data.trip_id}`);
  revalidatePath("/trips");
  return { success: true };
}
