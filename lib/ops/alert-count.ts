import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Unresolved-alert count for the top-bar bell. Cached across requests for 30s
 * (it's the same for all managers) so it doesn't add a Supabase round-trip to
 * every ops/billing page navigation. Uses the service client (no cookies) so it
 * can run inside `unstable_cache`.
 */
export const getUnresolvedAlertCount = unstable_cache(
  async (): Promise<number> => {
    const sb = createServiceClient();
    const { count } = await sb
      .schema("app")
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null);
    return count ?? 0;
  },
  ["unresolved-alert-count"],
  { revalidate: 30 },
);
