"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";
import { getMyDriver } from "@/lib/auth/driver";
import { onboardingSchema } from "@/lib/validation/onboarding";

export type ActionResult = { error: string } | { redirectTo: string };

/**
 * A driver completes their own profile (licence + phone). Used by the
 * first-login onboarding flow for import-created drivers whose
 * licence_number is still 'IMPORT-PENDING'. Writes go through a SECURITY
 * DEFINER RPC since drivers can't UPDATE app.drivers directly.
 */
export async function completeOnboarding(formData: FormData): Promise<ActionResult> {
  const profile = await requireAuth();
  // Gated on having a driver record rather than on role: a manager or
  // administrator who drives keeps their own licence current too.
  if (!(await getMyDriver(profile.id))) {
    return { error: "You do not have a driver record to update." };
  }

  const parsed = onboardingSchema.safeParse({
    phone: formData.get("phone"),
    licence_number: formData.get("licence_number"),
    licence_expires_at: formData.get("licence_expires_at") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_complete_driver_onboarding", {
    p_phone: parsed.data.phone,
    p_licence_number: parsed.data.licence_number,
    p_licence_expires_at: parsed.data.licence_expires_at || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/home");
}
