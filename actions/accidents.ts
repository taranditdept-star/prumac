"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAuth, requireRole } from "@/lib/auth/session";
import { accidentCreateSchema, accidentStatusSchema } from "@/lib/validation/accident";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

export async function reportAccident(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();
  if (!driver) return { error: "Driver profile not found." };

  const parsed = accidentCreateSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    trip_id: formData.get("trip_id") || null,
    severity: formData.get("severity"),
    occurred_at: formData.get("occurred_at"),
    location_description: formData.get("location_description"),
    odometer_km: formData.get("odometer_km") || null,
    lat: formData.get("lat") || null,
    lng: formData.get("lng") || null,
    weather: formData.get("weather") || null,
    road_conditions: formData.get("road_conditions") || null,
    description: formData.get("description"),
    other_parties_involved: formData.get("other_parties_involved") === "on" || formData.get("other_parties_involved") === "true",
    third_party_details: formData.get("third_party_details") || null,
    injuries: formData.get("injuries") === "on" || formData.get("injuries") === "true",
    injuries_details: formData.get("injuries_details") || null,
    police_report_number: formData.get("police_report_number") || null,
    police_station: formData.get("police_station") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .schema("app")
    .from("accidents")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      trip_id: parsed.data.trip_id ?? null,
      reported_by: driver.id,
      severity: parsed.data.severity,
      occurred_at: new Date(parsed.data.occurred_at).toISOString(),
      location_description: parsed.data.location_description,
      odometer_km: parsed.data.odometer_km ?? null,
      weather: parsed.data.weather ?? null,
      road_conditions: parsed.data.road_conditions ?? null,
      description: parsed.data.description,
      other_parties_involved: parsed.data.other_parties_involved,
      third_party_details: parsed.data.third_party_details
        ? { notes: parsed.data.third_party_details }
        : null,
      injuries: parsed.data.injuries,
      injuries_details: parsed.data.injuries_details ?? null,
      police_report_number: parsed.data.police_report_number ?? null,
      police_station: parsed.data.police_station ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  // Scene photos — compressed client-side, uploaded server-side via the service
  // client (bypasses Storage RLS), then linked to the accident.
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0) {
    const service = createServiceClient();
    for (const file of files) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `accident/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await service.storage
        .from("photos")
        .upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (upErr) continue; // best effort — never block the report on a photo
      await service
        .schema("app")
        .from("accident_photos")
        .insert({ accident_id: data.id, file_path: path });
    }
  }

  // Alert is raised automatically by the accidents_raise_alert trigger
  // (app.fn_alert_on_accident, SECURITY DEFINER) — do not insert here too,
  // or every accident would produce a duplicate alert.

  revalidatePath("/accidents");
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/live/map");

  if (profile.role === "driver") return { redirectTo: "/home" };
  redirect(`/accidents/${data.id}`);
}

export async function updateAccidentStatus(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const parsed = accidentStatusSchema.safeParse({
    accident_id: formData.get("accident_id"),
    status: formData.get("status"),
    closed_notes: formData.get("closed_notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "closed") {
    patch.closed_at = new Date().toISOString();
    patch.closed_notes = parsed.data.closed_notes ?? null;
  }

  const { error } = await supabase
    .schema("app")
    .from("accidents")
    .update(patch)
    .eq("id", parsed.data.accident_id);

  if (error) return { error: error.message };

  revalidatePath(`/accidents/${parsed.data.accident_id}`);
  revalidatePath("/accidents");
  return { success: true };
}
