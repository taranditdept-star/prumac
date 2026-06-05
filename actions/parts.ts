"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { partSchema, partMovementSchema } from "@/lib/validation/part";

export type ActionResult<T = void> = { error: string } | { success: true; data?: T };

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v == null || v === "" ? null : String(v);
}

export async function createPart(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = partSchema.safeParse({
    sku: s(formData, "sku"),
    name: formData.get("name"),
    category: formData.get("category") || "other",
    unit: formData.get("unit") || "each",
    unit_cost: s(formData, "unit_cost"),
    currency: formData.get("currency") || "USD",
    reorder_level: formData.get("reorder_level") || 0,
    opening_stock: formData.get("opening_stock") || 0,
    supplier: s(formData, "supplier"),
    location: s(formData, "location"),
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { opening_stock, ...part } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("app")
    .from("parts")
    .insert({ ...part, current_stock: 0, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: error.message };

  // Seed opening stock as the first ledger movement (keeps the audit trail honest).
  if (opening_stock > 0) {
    await supabase.schema("app").from("part_movements").insert({
      part_id: data.id,
      movement_type: "in",
      quantity: opening_stock,
      unit_cost: part.unit_cost ?? null,
      reference: "Opening stock",
      created_by: profile.id,
    });
  }

  revalidatePath("/parts");
  redirect("/parts");
}

export async function recordPartMovement(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");

  const parsed = partMovementSchema.safeParse({
    part_id: formData.get("part_id"),
    movement_type: formData.get("movement_type"),
    quantity: formData.get("quantity"),
    unit_cost: s(formData, "unit_cost"),
    vehicle_id: s(formData, "vehicle_id"),
    reference: s(formData, "reference"),
    notes: s(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.movement_type !== "adjustment" && parsed.data.quantity <= 0) {
    return { error: "Quantity must be greater than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("part_movements")
    .insert({ ...parsed.data, created_by: profile.id });
  if (error) return { error: error.message };

  // Surface a reorder alert if this movement pushed the part below its level.
  await supabase.schema("app").rpc("fn_scan_part_stock");

  revalidatePath("/parts");
  return { success: true };
}

export async function scanPartStock(): Promise<ActionResult<{ raised: number }>> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("fn_scan_part_stock");
  if (error) return { error: error.message };
  revalidatePath("/parts");
  return { success: true, data: { raised: Number(data ?? 0) } };
}
