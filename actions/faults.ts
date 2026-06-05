"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAuth, requireRole } from "@/lib/auth/session";
import { faultCreateSchema, faultStatusSchema } from "@/lib/validation/fault";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

// ───────────────────────────────────────────────────────────────────────────
// REPORT FAULT — driver-side
// ───────────────────────────────────────────────────────────────────────────
export async function reportFault(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAuth();
  const supabase = await createClient();

  // Resolve the driver_id for the current user
  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  if (!driver) return { error: "Driver profile not found. Contact your fleet manager." };

  const parsed = faultCreateSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    trip_id: formData.get("trip_id") || null,
    severity: formData.get("severity"),
    category: formData.get("category"),
    title: formData.get("title"),
    description: formData.get("description"),
    odometer_km: formData.get("odometer_km") || null,
    lat: formData.get("lat") || null,
    lng: formData.get("lng") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .schema("app")
    .from("faults")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      trip_id: parsed.data.trip_id ?? null,
      reported_by: driver.id,
      severity: parsed.data.severity,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      odometer_km: parsed.data.odometer_km ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  // Photo upload — separate FormData entries named photo[]
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0) {
    const service = createServiceClient();
    for (const file of files) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `fault/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await service.storage
        .from("photos")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) continue; // best-effort
      await service.schema("app").from("fault_photos").insert({ fault_id: data.id, file_path: path });
    }
  }

  // Raise an alert if severity is high or critical
  if (parsed.data.severity === "high" || parsed.data.severity === "critical") {
    const service = createServiceClient();
    await service.schema("app").from("alerts").insert({
      kind: "fault_reported",
      severity: parsed.data.severity === "critical" ? "critical" : "warning",
      vehicle_id: parsed.data.vehicle_id,
      trip_id: parsed.data.trip_id ?? null,
      fault_id: data.id,
      title: `Fault reported · ${parsed.data.title}`,
      body: parsed.data.description.slice(0, 200),
    });
  }

  revalidatePath("/faults");
  revalidatePath("/home");
  revalidatePath("/live");
  revalidatePath("/live/map");

  // Drivers and managers go to different destinations
  if (profile.role === "driver") return { redirectTo: "/home" };
  redirect(`/faults/${data.id}`);
}

// ───────────────────────────────────────────────────────────────────────────
// UPDATE STATUS — manager
// ───────────────────────────────────────────────────────────────────────────
export async function updateFaultStatus(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const parsed = faultStatusSchema.safeParse({
    fault_id: formData.get("fault_id"),
    status: formData.get("status"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const patch: Record<string, unknown> = { status: parsed.data.status };

  if (parsed.data.status === "acknowledged") {
    patch.acknowledged_at = new Date().toISOString();
    patch.acknowledged_by = profile.id;
  }
  if (parsed.data.status === "resolved" || parsed.data.status === "wont_fix") {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_notes = parsed.data.notes ?? null;
  }

  const { error } = await supabase
    .schema("app")
    .from("faults")
    .update(patch)
    .eq("id", parsed.data.fault_id);

  if (error) return { error: error.message };

  revalidatePath(`/faults/${parsed.data.fault_id}`);
  revalidatePath("/faults");
  return { success: true };
}
