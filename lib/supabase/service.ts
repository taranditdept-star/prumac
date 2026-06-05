import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client.
 *
 * BYPASSES RLS — only call from trusted server code (Server Actions,
 * Edge Functions, cron jobs). Never expose the service-role key to the
 * client bundle. The `SUPABASE_SERVICE_ROLE_KEY` env var has no
 * `NEXT_PUBLIC_` prefix so Next.js will refuse to bundle it for the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase server credentials");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
