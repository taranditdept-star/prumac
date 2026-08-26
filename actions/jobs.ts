"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { uuid } from "@/lib/validation/uuid";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

const VEHICLE_CLASSES = [
  "tanker", "truck", "minibus", "bakkie", "suv", "sedan", "farm_vehicle", "specialist",
] as const;

const jobSchema = z.object({
  subsidiary_id: uuid(),
  pickup_label: z.string().trim().min(2, "Where is it collecting from?").max(160),
  dropoff_label: z.string().trim().min(2, "Where is it going?").max(160),
  distance_km: z.coerce.number().min(0).max(9999).nullable().optional(),
  cargo_description: z.string().trim().max(500).nullable().optional(),
  load_count: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  vehicle_class: z.enum(VEHICLE_CLASSES).nullable().optional(),
  required_at: z.string().nullable().optional(),
  is_urgent: z.coerce.boolean().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  contact_phone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const empty = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : v);

export async function createJob(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");
  const parsed = jobSchema.safeParse({
    subsidiary_id: formData.get("subsidiary_id"),
    pickup_label: formData.get("pickup_label"),
    dropoff_label: formData.get("dropoff_label"),
    distance_km: empty(formData.get("distance_km")),
    cargo_description: empty(formData.get("cargo_description")),
    load_count: empty(formData.get("load_count")),
    vehicle_class: empty(formData.get("vehicle_class")),
    required_at: empty(formData.get("required_at")),
    is_urgent: formData.get("is_urgent") === "on",
    contact_name: empty(formData.get("contact_name")),
    contact_phone: empty(formData.get("contact_phone")),
    notes: empty(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("transport_jobs")
    .insert({ ...parsed.data, requested_by: profile.id, status: "requested" })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: error.message };

  revalidatePath("/dispatch");
  return { success: true, data: { id: data.id } };
}

/**
 * Prices the job against the rate card for a chosen vehicle.
 *
 * The figure comes from app.fn_quote_job, which resolves the rate through the
 * same function the invoice uses — so a customer is never quoted one number and
 * billed another.
 */
export async function quoteJob(formData: FormData): Promise<ActionResult<{ amount: number }>> {
  const profile = await requireRole("fleet_manager", "admin");
  const jobId = String(formData.get("job_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const distance = Number(formData.get("distance_km") ?? 0);
  const loads = Number(formData.get("load_count") ?? 1);
  const notes = empty(formData.get("quote_notes")) as string | null;
  if (!jobId || !vehicleId) return { error: "Pick a vehicle to price the job against." };
  if (!Number.isFinite(distance) || distance <= 0) return { error: "Enter the distance in km." };

  const supabase = await createClient();
  const { data: job, error: jobErr } = await supabase
    .schema("app").from("transport_jobs")
    .select("id, subsidiary_id, status").eq("id", jobId)
    .single<{ id: string; subsidiary_id: string; status: string }>();
  if (jobErr || !job) return { error: "Job not found." };

  interface QuoteRow {
    rate_id: string; mode: string; unit_amount: number;
    quantity: number; amount: number; currency: string;
  }
  const { data: quote, error: qErr } = await supabase.schema("app").rpc("fn_quote_job", {
    p_vehicle_id: vehicleId,
    p_subsidiary_id: job.subsidiary_id,
    p_distance_km: distance,
    p_load_count: Number.isFinite(loads) ? loads : 1,
  });
  if (qErr) return { error: qErr.message };

  // fn_quote_job returns a set: empty when the vehicle has no rate on file.
  const q = (quote as unknown as QuoteRow[] | null)?.[0];
  if (!q) {
    return {
      error: "That vehicle has no rate on file for this customer, so it cannot be priced. Add a rate first.",
    };
  }

  const { error: upErr } = await supabase
    .schema("app").from("transport_jobs")
    .update({
      vehicle_id: vehicleId,
      distance_km: distance,
      quoted_rate_id: q.rate_id,
      quoted_mode: q.mode,
      quoted_unit: q.unit_amount,
      quoted_amount: q.amount,
      quoted_currency: q.currency,
      quoted_at: new Date().toISOString(),
      quoted_by: profile.id,
      quote_notes: notes,
      status: job.status === "requested" ? "quoted" : job.status,
    })
    .eq("id", jobId);
  if (upErr) return { error: upErr.message };

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
  return { success: true, data: { amount: Number(q.amount) } };
}

/** Customer accepted, or didn't. */
export async function setJobDecision(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const jobId = String(formData.get("job_id") ?? "");
  const accepted = formData.get("accepted") === "1";
  const reason = empty(formData.get("reason")) as string | null;
  if (!jobId) return { error: "Missing job." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app").from("transport_jobs")
    .update({ status: accepted ? "approved" : "declined", closed_reason: accepted ? null : reason })
    .eq("id", jobId)
    .in("status", ["quoted", "approved", "declined"]);
  if (error) return { error: error.message };

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
  return { success: true };
}

/**
 * Allocates a vehicle and driver.
 *
 * Refuses a vehicle that is already on another live job — a double-booked truck
 * is discovered at the loading bay, which is far too late.
 */
export async function assignJob(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const jobId = String(formData.get("job_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const driverId = String(formData.get("driver_id") ?? "");
  if (!jobId || !vehicleId || !driverId) {
    return { error: "Pick both a vehicle and a driver." };
  }

  const supabase = await createClient();

  const { data: clash } = await supabase
    .schema("app").from("transport_jobs")
    .select("reference")
    .eq("vehicle_id", vehicleId)
    .in("status", ["assigned", "in_progress"])
    .neq("id", jobId)
    .limit(1)
    .maybeSingle<{ reference: string }>();
  if (clash) {
    return { error: `That vehicle is already on job ${clash.reference}. Free it first or pick another.` };
  }

  const { error } = await supabase
    .schema("app").from("transport_jobs")
    .update({
      vehicle_id: vehicleId, driver_id: driverId,
      assigned_at: new Date().toISOString(), assigned_by: profile.id,
      status: "assigned",
    })
    .eq("id", jobId);
  if (error) return { error: error.message };

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/${jobId}`);
  return { success: true };
}

export async function cancelJob(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const jobId = String(formData.get("job_id") ?? "");
  const reason = empty(formData.get("reason")) as string | null;
  if (!jobId) return { error: "Missing job." };
  if (!reason) return { error: "Say why it was cancelled." };

  const supabase = await createClient();
  // A job that already became a trip is history — cancel the trip, not the job.
  const { data: job } = await supabase
    .schema("app").from("transport_jobs")
    .select("trip_id, status").eq("id", jobId)
    .single<{ trip_id: string | null; status: string }>();
  if (job?.trip_id) {
    return { error: "This job is already running as a trip. Cancel the trip instead." };
  }

  const { error } = await supabase
    .schema("app").from("transport_jobs")
    .update({ status: "cancelled", closed_reason: reason })
    .eq("id", jobId);
  if (error) return { error: error.message };

  revalidatePath("/dispatch");
  return { success: true };
}
