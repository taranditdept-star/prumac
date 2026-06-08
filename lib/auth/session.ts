import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, ProfileRow } from "@/types/domain";

/**
 * Load the authed user's profile ONCE per server request. React `cache()`
 * dedupes calls within a single render, so the layout + page + nested helpers
 * share one `getUser()` + one profile fetch instead of each doing their own
 * round-trips to Supabase (a major source of slow page loads).
 */
const loadProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .schema("app")
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<ProfileRow>();

  return profile ?? null;
});

/** Returns the authenticated user's profile, or redirects to /login. */
export async function requireAuth(): Promise<ProfileRow> {
  const profile = await loadProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Returns the authenticated user's profile without redirecting. */
export async function getSession(): Promise<ProfileRow | null> {
  return loadProfile();
}

/** Asserts the current user has one of the specified roles. */
export async function requireRole(...roles: AppRole[]): Promise<ProfileRow> {
  const profile = await requireAuth();
  if (!roles.includes(profile.role as AppRole)) {
    redirect(roleDefaultPath(profile.role as AppRole));
  }
  return profile;
}

export function roleDefaultPath(role: AppRole): string {
  switch (role) {
    case "driver":
      return "/home";
    case "fleet_manager":
      return "/live";
    case "admin":
      return "/live";
    case "subsidiary_billing":
      return "/invoices";
  }
}
