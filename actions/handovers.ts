"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import {
  initiateHandoverSchema,
  confirmTakeoverSchema,
  type InitiateHandoverInput,
  type ConfirmTakeoverInput,
} from "@/lib/validation/handover";

export type ActionResult<T = void> =
  | { error: string }
  | { success: true; data?: T }
  | { redirectTo: string };

export async function initiateHandover(
  payload: InitiateHandoverInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAuth();
  const parsed = initiateHandoverSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("app").rpc("fn_initiate_handover", {
    p_vehicle_id: parsed.data.vehicle_id,
    p_to_driver_id: parsed.data.to_driver_id,
    p_template_id: parsed.data.template_id,
    p_odometer_km: parsed.data.odometer_km,
    p_inspection_notes: parsed.data.inspection_notes ?? null,
    p_items: parsed.data.items,
    p_handover_notes: parsed.data.handover_notes ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/handover");
  revalidatePath("/home");
  revalidatePath("/handovers");
  return { success: true, data: { id: data as string } };
}

export async function confirmTakeover(
  payload: ConfirmTakeoverInput,
): Promise<ActionResult> {
  await requireAuth();
  const parsed = confirmTakeoverSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_confirm_takeover", {
    p_handover_id: parsed.data.handover_id,
    p_template_id: parsed.data.template_id,
    p_odometer_km: parsed.data.odometer_km,
    p_notes: parsed.data.notes ?? null,
    p_items: parsed.data.items,
  });
  if (error) return { error: error.message };

  revalidatePath("/handover");
  revalidatePath("/home");
  revalidatePath("/handovers");
  return { success: true };
}

export async function rejectHandover(handoverId: string, reason: string): Promise<ActionResult> {
  await requireAuth();
  if (reason.trim().length < 3) return { error: "Give a reason for rejecting." };
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_reject_takeover", {
    p_handover_id: handoverId,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath("/handover");
  revalidatePath("/home");
  return { success: true };
}

export async function cancelHandover(handoverId: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_cancel_handover", {
    p_handover_id: handoverId,
  });
  if (error) return { error: error.message };
  revalidatePath("/handover");
  revalidatePath("/home");
  return { success: true };
}
