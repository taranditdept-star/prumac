"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAuth } from "@/lib/auth/session";
import { announceFaultsToTeam } from "@/lib/chat/announce";

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
  /** A problem the driver reports that is NOT on the checklist. Becomes an "other" fault. */
  other_problem?: string;
}

/**
 * Submit a standalone vehicle checklist (not tied to a trip). The driver is
 * derived server-side from the session inside fn_submit_standalone_inspection,
 * which also enforces that the driver currently holds the vehicle.
 *
 * The RPC bridges any flagged item into app.faults (opening a fault if one isn't
 * already open, and auto-resolving when a previously-open item is now OK). Here
 * we additionally: (a) capture a free-text "other problem" as its own fault, and
 * (b) raise manager alerts + announce newly-opened serious faults.
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
  const inspectionId = data as string;

  // Free-text "something wrong that's not on the list" → an open "other" fault.
  // Dedupe: if the same off-list problem is already open on this vehicle, don't
  // create a duplicate. Because the duplicate is never inserted with THIS
  // inspection_id, it also isn't re-announced — otherwise a persistent off-list
  // issue re-typed each day would pile up faults and spam the team chat.
  const other = payload.other_problem?.trim();
  if (other) {
    const [{ data: driver }, { data: openOther }] = await Promise.all([
      supabase
        .schema("app")
        .from("drivers")
        .select("id")
        .eq("profile_id", (await requireAuth()).id)
        .maybeSingle<{ id: string }>(),
      supabase
        .schema("app")
        .from("faults")
        .select("description")
        .eq("vehicle_id", payload.vehicle_id)
        .is("checklist_item_id", null)
        .in("status", ["reported", "acknowledged", "in_repair"])
        .returns<{ description: string | null }[]>(),
    ]);
    const norm = (s: string) => s.trim().toLowerCase();
    const already = (openOther ?? []).some((f) => f.description && norm(f.description) === norm(other));
    if (driver && !already) {
      await supabase
        .schema("app")
        .from("faults")
        .insert({
          vehicle_id: payload.vehicle_id,
          reported_by: driver.id,
          severity: "low",
          category: "other",
          title: other.length > 80 ? `${other.slice(0, 79)}…` : other,
          description: other,
          odometer_km: payload.odometer_km,
          source: "checklist",
          inspection_id: inspectionId,
        });
    }
  }

  // Newly opened faults from this submission (checklist items + the "other" note).
  const { data: newFaults } = await supabase
    .schema("app")
    .from("faults")
    .select("id, severity, title, description, vehicle_id, trip_id")
    .eq("inspection_id", inspectionId)
    .returns<
      { id: string; severity: string; title: string; description: string; vehicle_id: string; trip_id: string | null }[]
    >();

  if (newFaults && newFaults.length > 0) {
    const service = createServiceClient();
    // Raise a manager alert for each serious (high/critical) new fault.
    const serious = newFaults.filter((f) => f.severity === "high" || f.severity === "critical");
    for (const f of serious) {
      await service.schema("app").from("alerts").insert({
        kind: "fault_reported",
        severity: f.severity === "critical" ? "critical" : "warning",
        vehicle_id: f.vehicle_id,
        trip_id: f.trip_id,
        fault_id: f.id,
        title: `Checklist fault · ${f.title}`,
        body: f.description.slice(0, 200),
      });
    }
    // Announce every new fault to the team group (Batch F helper, fire-and-forget).
    await announceFaultsToTeam(newFaults.map((f) => ({ id: f.id, title: f.title, severity: f.severity })));
  }

  const { data: insp } = await supabase
    .schema("app")
    .from("inspections")
    .select("id, overall_result")
    .eq("id", inspectionId)
    .single<{ id: string; overall_result: "pass" | "attention" | "fail" }>();

  revalidatePath("/checklist");
  revalidatePath("/home");
  revalidatePath("/inspections");
  revalidatePath("/faults");
  revalidatePath("/live");

  return {
    success: true,
    data: {
      id: insp?.id ?? inspectionId,
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
