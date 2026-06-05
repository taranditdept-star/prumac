"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleDefaultPath } from "@/lib/auth/session";
import { emailLoginSchema } from "@/lib/validation/auth";
import type { AppRole } from "@/types/domain";

/**
 * Form-mode sign in. Used as the `action` attribute on the email login form
 * so it works even when JavaScript hasn't hydrated. Server-side redirect on
 * success ensures cookies are committed before navigation.
 *
 * Errors come back as a `?error=` query string the form reads to display.
 */
export async function signInWithEmailForm(formData: FormData): Promise<void> {
  const parsed = emailLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Sign-in failed. Please try again.")}`);
  }

  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: AppRole }>();

  // Crucial: revalidate the layout so the new session is read on the next render
  revalidatePath("/", "layout");
  redirect(roleDefaultPath(profile?.role ?? "driver"));
}
