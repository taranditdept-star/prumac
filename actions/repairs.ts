"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAuth, requireRole } from "@/lib/auth/session";
import {
  repairClaimCreateSchema,
  repairClaimApproveSchema,
  repairClaimRejectSchema,
} from "@/lib/validation/repair";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

// ───────────────────────────────────────────────────────────────────────────
// Driver / subsidiary submits a repair claim with a receipt photo.
// ───────────────────────────────────────────────────────────────────────────
export async function submitRepairClaim(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const profile = await requireAuth();
  const supabase = await createClient();

  const parsed = repairClaimCreateSchema.safeParse({
    vehicle_id: formData.get("vehicle_id"),
    subsidiary_id: formData.get("subsidiary_id") || null,
    description: formData.get("description"),
    amount: formData.get("amount"),
    currency: formData.get("currency") || "USD",
    odometer_km: formData.get("odometer_km") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .schema("app")
    .from("repair_claims")
    .insert({
      vehicle_id: parsed.data.vehicle_id,
      submitted_by: profile.id,
      subsidiary_id: parsed.data.subsidiary_id ?? null,
      description: parsed.data.description,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      odometer_km: parsed.data.odometer_km ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: error.message };

  // Receipt upload (optional but expected) — stored in the photos bucket.
  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > 0) {
    const service = createServiceClient();
    const ext = receipt.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `repair/${data.id}/receipt.${ext}`;
    const { error: upErr } = await service.storage
      .from("photos")
      .upload(path, receipt, { upsert: true, contentType: receipt.type });
    if (!upErr) {
      await service
        .schema("app")
        .from("repair_claims")
        .update({ receipt_path: path })
        .eq("id", data.id);
    }
  }

  revalidatePath("/repairs");
  revalidatePath("/repair");
  revalidatePath("/home");

  if (profile.role === "driver") return { redirectTo: "/home" };
  return { success: true, data: { id: data.id } };
}

// ───────────────────────────────────────────────────────────────────────────
// Manager / admin approves a claim → creates the reimbursable service record.
// ───────────────────────────────────────────────────────────────────────────
export async function approveRepairClaim(formData: FormData): Promise<ActionResult> {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const parsed = repairClaimApproveSchema.safeParse({
    claim_id: formData.get("claim_id"),
    reimburse_subsidiary_id: formData.get("reimburse_subsidiary_id"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.schema("app").rpc("fn_approve_repair_claim", {
    p_claim_id: parsed.data.claim_id,
    p_reimburse_subsidiary: parsed.data.reimburse_subsidiary_id,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/repairs");
  revalidatePath(`/repairs/${parsed.data.claim_id}`);
  return { success: true };
}

export async function rejectRepairClaim(formData: FormData): Promise<ActionResult> {
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const parsed = repairClaimRejectSchema.safeParse({
    claim_id: formData.get("claim_id"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .schema("app")
    .from("repair_claims")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: parsed.data.notes,
    })
    .eq("id", parsed.data.claim_id)
    .eq("status", "submitted");

  if (error) return { error: error.message };

  revalidatePath("/repairs");
  revalidatePath(`/repairs/${parsed.data.claim_id}`);
  return { success: true };
}
