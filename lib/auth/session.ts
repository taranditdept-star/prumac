import { cache } from "react";
import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AppRole, ProfileRow } from "@/types/domain";

const PROFILE_COLS =
  "id, full_name, email, phone, role, subsidiary_id, avatar_url, is_active, deactivated_at, last_seen_at, created_at, updated_at";

/**
 * Fetch a profile by id, cached across requests for 60s. The profile (name,
 * role) barely changes, so this avoids a ~200ms Supabase round-trip on EVERY
 * page navigation. Uses the service client so it can run inside unstable_cache.
 */
const cachedProfileById = unstable_cache(
  async (userId: string): Promise<ProfileRow | null> => {
    const sb = createServiceClient();
    const { data } = await sb
      .schema("app")
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", userId)
      .single<ProfileRow>();
    return data ?? null;
  },
  ["auth-profile"],
  { revalidate: 60 },
);

/**
 * Load the authed user's profile. `getSession()` reads the cookie locally (no
 * network — the proxy already validated it) and the profile is cached for 60s,
 * so most navigations make ZERO auth round-trips. React `cache()` dedupes
 * within a single render (layout + page share one call).
 */
const loadProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  return cachedProfileById(user.id);
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
