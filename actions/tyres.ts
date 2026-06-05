"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { tyreSchema, tyreEventSchema } from "@/lib/validation/tyre";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v == null || v === "" ? null : String(v);
}

export async function createTyre(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = tyreSchema.safeParse({
    serial_number: s(formData, "serial_number"),
    brand: s(formData, "brand"),
    pattern: s(formData, "pattern"),
    size: s(formData, "size"),
    vehicle_id: s(formData, "vehicle_id"),
    position: s(formData, "position"),
    status: formData.get("status") || "in_store",
    fitted_at: s(formData, "fitted_at"),
    fitted_odometer_km: s(formData, "fitted_odometer_km"),
    tread_depth_mm: s(formData, "tread_depth_mm"),
    cost: s(formData, "cost"),
    currency: formData.get("currency") || "USD",
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.status === "in_service" && (!parsed.data.vehicle_id || !parsed.data.position)) {
    return { error: "An in-service tyre needs both a vehicle and a position." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("tyres")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: error.message };

  // Record the initial event for the lifecycle history.
  if (parsed.data.status === "in_service") {
    await supabase.schema("app").from("tyre_events").insert({
      tyre_id: data.id,
      vehicle_id: parsed.data.vehicle_id,
      event_type: "fitted",
      position: parsed.data.position,
      odometer_km: parsed.data.fitted_odometer_km ?? null,
      tread_depth_mm: parsed.data.tread_depth_mm ?? null,
      occurred_at: parsed.data.fitted_at ?? new Date().toISOString().slice(0, 10),
      created_by: profile.id,
    });
  }

  revalidatePath("/tyres");
  redirect("/tyres");
}

export async function recordTyreEvent(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = tyreEventSchema.safeParse({
    tyre_id: formData.get("tyre_id"),
    vehicle_id: s(formData, "vehicle_id"),
    event_type: formData.get("event_type"),
    position: s(formData, "position"),
    odometer_km: s(formData, "odometer_km"),
    tread_depth_mm: s(formData, "tread_depth_mm"),
    occurred_at: formData.get("occurred_at") || new Date().toISOString().slice(0, 10),
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("tyre_events")
    .insert({ ...parsed.data, created_by: profile.id });
  if (error) return { error: error.message };

  // Keep the tyre row in step with significant lifecycle events.
  const e = parsed.data;
  if (e.event_type === "removed" || e.event_type === "scrapped") {
    await supabase
      .schema("app")
      .from("tyres")
      .update({
        status: e.event_type === "scrapped" ? "scrapped" : "in_store",
        vehicle_id: null,
        position: null,
        removed_at: e.occurred_at,
        ...(e.tread_depth_mm != null ? { tread_depth_mm: e.tread_depth_mm } : {}),
      })
      .eq("id", e.tyre_id);
  } else if (e.event_type === "rotated" && e.position) {
    await supabase
      .schema("app")
      .from("tyres")
      .update({ position: e.position })
      .eq("id", e.tyre_id);
  } else if (e.event_type === "inspected" && e.tread_depth_mm != null) {
    await supabase
      .schema("app")
      .from("tyres")
      .update({ tread_depth_mm: e.tread_depth_mm })
      .eq("id", e.tyre_id);
  }

  revalidatePath("/tyres");
  return { success: true };
}
