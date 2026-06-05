"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { pmPlanSchema } from "@/lib/validation/pmPlan";
import { uuid } from "@/lib/validation/uuid";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T };

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v == null || v === "" ? null : String(v);
}

const serviceRecordSchema = z.object({
  vehicle_id: uuid(),
  performed_at: z.string().min(1),
  odometer_km: z.coerce.number().int().min(0).nullable().optional(),
  is_routine_service: z.coerce.boolean().default(false),
  workshop: z.string().max(120).nullable().optional(),
  invoice_reference: z.string().max(80).nullable().optional(),
  total_amount: z.coerce.number().min(0),
  reimburse_from_subsidiary_id: uuid().nullable().optional(),
  summary: z.string().max(500).nullable().optional(),
});

export async function createServiceRecord(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = serviceRecordSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    performed_at: formData.get("performed_at"),
    odometer_km: formData.get("odometer_km") || null,
    is_routine_service: formData.get("is_routine_service") === "on" || formData.get("is_routine_service") === "true",
    workshop: formData.get("workshop") || null,
    invoice_reference: formData.get("invoice_reference") || null,
    total_amount: formData.get("total_amount"),
    reimburse_from_subsidiary_id: formData.get("reimburse_from_subsidiary_id") || null,
    summary: formData.get("summary") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("service_records")
    .insert({
      ...parsed.data,
      reimburse_from_subsidiary_id: parsed.data.reimburse_from_subsidiary_id ?? null,
      odometer_km: parsed.data.odometer_km ?? null,
      workshop: parsed.data.workshop ?? null,
      invoice_reference: parsed.data.invoice_reference ?? null,
      summary: parsed.data.summary ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  // Update vehicle's last_service_odometer_km if a routine service was performed
  if (parsed.data.is_routine_service && parsed.data.odometer_km != null) {
    await supabase
      .schema("app")
      .from("vehicles")
      .update({ last_service_odometer_km: parsed.data.odometer_km })
      .eq("id", parsed.data.vehicle_id);
  }

  revalidatePath("/maintenance");
  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  redirect("/maintenance");
}

// ---------------------------------------------------------------------------
// Preventive-maintenance scheduler
// ---------------------------------------------------------------------------

export async function createPmPlan(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = pmPlanSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    task_name: formData.get("task_name"),
    interval_km: s(formData, "interval_km"),
    interval_days: s(formData, "interval_days"),
    last_done_km: s(formData, "last_done_km"),
    last_done_at: s(formData, "last_done_at"),
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("pm_plans")
    .insert({ ...parsed.data, created_by: profile.id });
  if (error) return { error: error.message };

  revalidatePath("/maintenance/schedule");
  return { success: true };
}

/** Mark a plan as done now, advancing its km/date baseline. */
export async function completePmPlan(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const planId = String(formData.get("plan_id") ?? "");
  const odometer = s(formData, "odometer_km");
  if (!planId) return { error: "Missing plan id." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("pm_plans")
    .update({
      last_done_at: new Date().toISOString().slice(0, 10),
      ...(odometer ? { last_done_km: Number(odometer) } : {}),
    })
    .eq("id", planId);
  if (error) return { error: error.message };

  revalidatePath("/maintenance/schedule");
  return { success: true };
}

/** Run the due-service scan; returns how many alerts were raised. */
export async function scanServiceDue(): Promise<ActionResult<{ raised: number }>> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .rpc("fn_scan_service_due", { p_within_km: 500, p_within_days: 7 });
  if (error) return { error: error.message };

  revalidatePath("/maintenance/schedule");
  revalidatePath("/live");
  return { success: true, data: { raised: Number(data ?? 0) } };
}
