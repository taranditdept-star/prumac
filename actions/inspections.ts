"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAuth } from "@/lib/auth/session";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T };

interface ItemResultIn {
  checklist_item_id: string;
  result: "pass" | "attention" | "fail";
  notes?: string;
  photo_path?: string;
}

interface SubmitInspectionPayload {
  trip_id: string;
  type: "pre_trip" | "post_trip";
  template_id: string;
  odometer_km: number;
  notes?: string;
  items: ItemResultIn[];
}

export async function submitInspection(
  payload: SubmitInspectionPayload,
): Promise<ActionResult<{ id: string; overall_result: "pass" | "attention" | "fail" }>> {
  await requireAuth();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .rpc("fn_submit_inspection", {
      p_trip_id: payload.trip_id,
      p_type: payload.type,
      p_template_id: payload.template_id,
      p_odometer_km: payload.odometer_km,
      p_notes: payload.notes ?? null,
      p_items: payload.items,
    });

  if (error) return { error: error.message };

  // Re-fetch the overall_result so the UI can show pass/attention/fail
  const { data: insp } = await supabase
    .schema("app")
    .from("inspections")
    .select("id, overall_result")
    .eq("id", data as string)
    .single<{ id: string; overall_result: "pass" | "attention" | "fail" }>();

  revalidatePath(`/trip/${payload.trip_id}`);
  revalidatePath(`/trips/${payload.trip_id}`);
  revalidatePath("/inspections");

  return {
    success: true,
    data: {
      id: insp?.id ?? (data as string),
      overall_result: insp?.overall_result ?? "pass",
    },
  };
}

interface SubmitStandalonePayload {
  vehicle_id: string;
  template_id: string;
  odometer_km: number;
  notes?: string;
  items: ItemResultIn[];
}

/**
 * Submit a standalone vehicle checklist (not tied to a trip). The driver is
 * derived server-side from the session inside fn_submit_standalone_inspection,
 * which also enforces that the driver currently holds the vehicle.
 */
export async function submitStandaloneInspection(
  payload: SubmitStandalonePayload,
): Promise<ActionResult<{ id: string; overall_result: "pass" | "attention" | "fail" }>> {
  await requireAuth();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .rpc("fn_submit_standalone_inspection", {
      p_vehicle_id: payload.vehicle_id,
      p_type: "daily_checklist",
      p_template_id: payload.template_id,
      p_odometer_km: payload.odometer_km,
      p_notes: payload.notes ?? null,
      p_items: payload.items,
    });

  if (error) return { error: error.message };

  const { data: insp } = await supabase
    .schema("app")
    .from("inspections")
    .select("id, overall_result")
    .eq("id", data as string)
    .single<{ id: string; overall_result: "pass" | "attention" | "fail" }>();

  revalidatePath("/checklist");
  revalidatePath("/home");
  revalidatePath("/inspections");

  return {
    success: true,
    data: {
      id: insp?.id ?? (data as string),
      overall_result: insp?.overall_result ?? "pass",
    },
  };
}

/**
 * Upload an inspection item photo. Returns the storage path so the client can
 * pass it as `photo_path` when calling submitInspection().
 */
export async function uploadInspectionItemPhoto(
  inspectionScope: string,
  file: File,
): Promise<{ error: string } | { path: string }> {
  await requireAuth();
  const service = createServiceClient();
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `inspection/${inspectionScope}/${crypto.randomUUID()}.${ext}`;
  const { error } = await service.storage
    .from("photos")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) return { error: error.message };
  return { path };
}
