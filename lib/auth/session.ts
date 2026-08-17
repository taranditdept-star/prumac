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
 * Load the authed user's profile.
 *
 * SECURITY: this MUST use getUser(), which verifies the access token with the
 * auth server. getSession() only base64-decodes the cookie and checks that a few
 * keys exist — it never validates the signature. Because the profile is then
 * resolved with the SERVICE client (RLS-bypassing, so it can run inside
 * unstable_cache), a forged cookie carrying any known admin's user id used to
 * come back as a genuine admin ProfileRow and satisfy requireRole("admin").
 * Every server action in this app authorises through requireAuth/requireRole, so
 * that single unverified read was an app-wide privilege escalation — RLS is NOT
 * the backstop here, precisely because these paths use the service client.
 *
 * React `cache()` dedupes it within a render (layout + page share one call), and
 * the profile row itself is still cached 60s, so this costs one verified auth
 * call per request — cheap now that Vercel runs in cdg1 alongside Supabase.
 */
const loadProfile = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
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
