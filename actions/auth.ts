"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleDefaultPath } from "@/lib/auth/session";
import {
  usernameLoginSchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
  resetPasswordSchema,
  newPasswordSchema,
} from "@/lib/validation/auth";
import type { AppRole } from "@/types/domain";
import { normalisePhone } from "@/lib/utils/phone";
import { usernameToEmail } from "@/lib/auth/username";

export type ActionResult =
  | { error: string }
  | { success: true }
  | { redirectTo: string };

/** Sign in with username (driver ID, or email for staff) + password. */
export async function signInWithEmail(formData: FormData): Promise<ActionResult> {
  const parsed = usernameLoginSchema.safeParse({
    username: formData.get("username") ?? formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error, data: signInData } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
  });

  if (error) return { error: "Wrong username or password." };
  if (!signInData.user) return { error: "Sign-in failed. Please try again." };

  const { data: profile, error: profileError } = await supabase
    .schema("app")
    .from("profiles")
    .select("role")
    .eq("id", signInData.user.id)
    .single<{ role: AppRole }>();
  void profileError;

  const target = roleDefaultPath(profile?.role ?? "driver");

  // Invalidate Next.js layout cache so the new auth state is read on next render.
  revalidatePath("/", "layout");

  // Use Next.js redirect — its NEXT_REDIRECT throw is intercepted by the framework
  // AFTER cookies are committed to the response.
  redirect(target);
}

/** Request a phone OTP. */
export async function requestPhoneOtp(formData: FormData): Promise<ActionResult> {
  const parsed = phoneOtpRequestSchema.safeParse({ phone: formData.get("phone") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const phone = normalisePhone(parsed.data.phone);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) return { error: error.message };

  return { success: true };
}

/** Verify a phone OTP and sign in. */
export async function verifyPhoneOtp(formData: FormData): Promise<ActionResult> {
  const parsed = phoneOtpVerifySchema.safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const phone = normalisePhone(parsed.data.phone);
  const supabase = await createClient();
  const { error, data } = await supabase.auth.verifyOtp({
    phone,
    token: parsed.data.token,
    type: "sms",
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Verification failed. Please try again." };

  await claimDriverRecordIfNeeded(data.user.id, phone);

  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single<{ role: AppRole }>();

  revalidatePath("/", "layout");
  redirect(roleDefaultPath(profile?.role ?? "driver"));
}

/** Send a password-reset email. */
export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // Build the reset link from the app's own origin — never derive it from the
  // Supabase hostname (that produced a non-existent <ref>.vercel.app domain).
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://prumac.vercel.app").replace(/\/$/, "");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/reset-password/confirm`,
  });
  if (error) return { error: error.message };

  return { success: true };
}

/** Set a new password after email reset. */
export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/login?message=password-updated");
}

/** Sign out. */
export async function signOut(): Promise<ActionResult> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Helpers

async function claimDriverRecordIfNeeded(userId: string, phone: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .schema("app")
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .single<{ id: string }>();
  if (existing) return;

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id, full_name, subsidiary_id")
    .eq("phone", phone)
    .is("profile_id", null)
    .single<{ id: string; full_name: string; subsidiary_id: string | null }>();

  if (!driver) {
    await supabase.schema("app").from("profiles").insert({
      id: userId,
      role: "driver",
      phone,
      full_name: null,
      subsidiary_id: null,
      driver_id: null,
    });
    return;
  }

  await supabase.schema("app").from("profiles").insert({
    id: userId,
    role: "driver",
    phone,
    full_name: driver.full_name,
    subsidiary_id: driver.subsidiary_id,
    driver_id: driver.id,
  });

  await supabase
    .schema("app")
    .from("drivers")
    .update({ profile_id: userId })
    .eq("id", driver.id);
}
