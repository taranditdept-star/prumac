"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { myProfileSchema } from "@/lib/validation/myProfile";
import { normalisePhone } from "@/lib/utils/phone";

export type MyProfileResult = { error: string } | { success: true };

const nullIfBlank = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

/**
 * A driver updates their OWN details.
 *
 * The write goes through app.fn_update_my_driver_profile (SECURITY DEFINER),
 * which derives the driver from auth.uid() — so this can only ever touch the
 * caller's own rows, and no driver id is accepted from the client.
 */
export async function updateMyDriverProfile(formData: FormData): Promise<MyProfileResult> {
  await requireRole("driver");

  const parsed = myProfileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    licence_number: formData.get("licence_number"),
    licence_country: formData.get("licence_country"),
    licence_classes: formData.getAll("licence_classes"),
    licence_issued_at: nullIfBlank(formData.get("licence_issued_at")),
    licence_expires_at: nullIfBlank(formData.get("licence_expires_at")),
    defensive_driving_cert_at: nullIfBlank(formData.get("defensive_driving_cert_at")),
    medical_cert_expires_at: nullIfBlank(formData.get("medical_cert_expires_at")),
    home_address: nullIfBlank(formData.get("home_address")),
    next_of_kin_name: nullIfBlank(formData.get("next_of_kin_name")),
    next_of_kin_phone: nullIfBlank(formData.get("next_of_kin_phone")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.schema("app").rpc("fn_update_my_driver_profile", {
    p_full_name: d.full_name.trim(),
    p_phone: normalisePhone(d.phone),
    p_licence_number: d.licence_number.trim(),
    p_licence_country: d.licence_country,
    p_licence_classes: d.licence_classes?.length ? d.licence_classes : null,
    p_licence_issued_at: d.licence_issued_at || null,
    p_licence_expires_at: d.licence_expires_at || null,
    p_defensive_cert_at: d.defensive_driving_cert_at || null,
    p_medical_expires_at: d.medical_cert_expires_at || null,
    p_home_address: d.home_address || null,
    p_next_of_kin_name: d.next_of_kin_name || null,
    p_next_of_kin_phone: d.next_of_kin_phone ? normalisePhone(d.next_of_kin_phone) : null,
  });

  if (error) {
    // phone is UNIQUE on profiles — say so plainly instead of showing a raw
    // Postgres constraint error to a driver.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      return { error: "That phone number is already registered to another person. Check the number, or tell the office." };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/home");
  return { success: true };
}
