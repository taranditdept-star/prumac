"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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

// A start odometer above the last known reading by more than this many km is
// treated as an implausible jump worth flagging (legitimate gaps from other
// drivers' trips are usually far smaller).
const ODOMETER_JUMP_THRESHOLD_KM = 1500;

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

  // Odometer photo is mandatory for drivers — it is the tamper-proof evidence
  // that the entered start reading is genuine. Managers/admins dispatching from
  // the office aren't at the vehicle, so it's optional for them.
  const photoEntry = formData.get("start_odometer_photo");
  const photo = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  if (!photo && profile.role === "driver") {
    return { error: "A photo of the odometer is required to start a trip." };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Drivers must accept the active vehicle-use agreement before a trip starts.
  // We resolve the active version server-side and record which one was accepted,
  // rather than trusting a client-sent id.
  const { data: agreement } = await supabase
    .schema("app")
    .from("agreements")
    .select("id")
    .eq("kind", "trip_terms")
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();

  const termsAccepted =
    formData.get("terms_accepted") === "true" || formData.get("terms_accepted") === "on";
  if (profile.role === "driver" && agreement && !termsAccepted) {
    return { error: "You must accept the vehicle-use terms before starting a trip." };
  }

  // Last known reading for this vehicle — used to detect a rolled-back or
  // implausibly-jumped start odometer.
  const { data: vehicle } = await supabase
    .schema("app")
    .from("vehicles")
    .select("current_odometer_km")
    .eq("id", parsed.data.vehicle_id)
    .single<{ current_odometer_km: number }>();
  const lastKnown = vehicle?.current_odometer_km ?? null;

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
      terms_agreement_id: termsAccepted ? (agreement?.id ?? null) : null,
      terms_accepted_at: termsAccepted ? nowIso : null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "This vehicle or driver already has an open trip." };
    }
    return { error: error.message };
  }

  // Upload the odometer photo (when provided) and record its storage key.
  const service = createServiceClient();
  let photoPath: string | null = null;
  if (photo) {
    const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `trip/${data.id}/start-odometer.${ext}`;
    const { error: upErr } = await service.storage
      .from("photos")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (!upErr) {
      photoPath = path;
      await supabase
        .schema("app")
        .from("trips")
        .update({ start_odometer_photo_path: path })
        .eq("id", data.id);
    }
  }

  // Tamper detection — flag a rollback or implausible jump for manager review.
  if (lastKnown != null) {
    const entered = parsed.data.start_odometer_km;
    const delta = entered - lastKnown;
    const isRollback = delta < 0;
    const isJump = delta > ODOMETER_JUMP_THRESHOLD_KM;
    if (isRollback || isJump) {
      await service.schema("app").from("alerts").insert({
        kind: "odometer_mismatch",
        severity: isRollback ? "critical" : "warning",
        vehicle_id: parsed.data.vehicle_id,
        driver_id: parsed.data.driver_id,
        trip_id: data.id,
        title: isRollback
          ? "Odometer rolled back at trip start"
          : "Odometer jumped at trip start",
        body: `Entered ${entered.toLocaleString()} km vs last known ${lastKnown.toLocaleString()} km (${
          delta >= 0 ? "+" : ""
        }${delta.toLocaleString()} km).`,
        payload: {
          entered_km: entered,
          last_known_km: lastKnown,
          delta_km: delta,
          photo_path: photoPath,
        },
      });
    }
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
  revalidatePath("/live/map");
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
// END trip — capture end odometer and AUTO-COMPLETE.
// The driver ending a trip immediately completes it (status ended → completed,
// reconciliation, vehicle freed) so they can start another trip right away,
// without waiting for an admin to mark it complete — important for trips that
// finish after hours. The DB state machine only allows in_progress→ended and
// ended→completed, so we do both steps here.
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

  // Step 1 — end the trip via the user client (RLS confirms the caller owns it).
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .schema("app")
    .from("trips")
    .update({
      status: "ended",
      ended_at: nowIso,
      end_odometer_km: parsed.data.end_odometer_km,
      fuel_litres: parsed.data.fuel_litres ?? null,
      fuel_amount: parsed.data.fuel_amount ?? null,
    })
    .eq("id", parsed.data.trip_id);

  if (error) return { error: error.message };

  // Step 2 — auto-complete. Uses the service client so it works regardless of
  // role (drivers can't update vehicles under RLS). Reconciliation is best
  // effort: a manager can re-run it from the reconciliation review page.
  const service = createServiceClient();
  const { error: completeErr } = await service
    .schema("app")
    .from("trips")
    .update({ status: "completed", completed_at: nowIso })
    .eq("id", parsed.data.trip_id);

  if (completeErr) {
    // The trip is safely "ended"; surface the error so it can be completed later.
    revalidatePath(`/trips/${parsed.data.trip_id}`);
    return { error: `Trip ended but auto-complete failed: ${completeErr.message}` };
  }

  const { error: recErr } = await service
    .schema("app")
    .rpc("fn_reconcile_trip", { p_trip_id: parsed.data.trip_id });
  if (recErr) {
    console.error("Reconciliation failed for trip", parsed.data.trip_id, recErr.message);
  }

  await service
    .schema("app")
    .from("vehicles")
    .update({ status: "available" })
    .eq("id", trip.vehicle_id);

  revalidatePath(`/trips/${parsed.data.trip_id}`);
  revalidatePath("/trips");
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/reconciliation");
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
