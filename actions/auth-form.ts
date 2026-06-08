"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleDefaultPath } from "@/lib/auth/session";
import { usernameLoginSchema } from "@/lib/validation/auth";
import { usernameToEmail } from "@/lib/auth/username";
import type { AppRole } from "@/types/domain";

/**
 * Form-mode sign in. Used as the `action` attribute on the email login form
 * so it works even when JavaScript hasn't hydrated. Server-side redirect on
 * success ensures cookies are committed before navigation.
 *
 * Errors come back as a `?error=` query string the form reads to display.
 */
export async function signInWithEmailForm(formData: FormData): Promise<void> {
  const parsed = usernameLoginSchema.safeParse({
    username: formData.get("username") ?? formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(parsed.data.username),
    password: parsed.data.password,
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent("Wrong username or password.")}`);
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
