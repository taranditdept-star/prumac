"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/session";

export type ActionResult = { error: string } | { success: true };

/**
 * Persist (or refresh) the caller's Web Push subscription. Called from the
 * browser after the PushManager hands back a subscription. RLS guarantees a
 * user can only write their own row (profile_id = auth.uid()).
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<ActionResult> {
  const profile = await requireAuth();
  const supabase = await createClient();

  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { error: "Incomplete subscription." };
  }

  const { error } = await supabase
    .schema("app")
    .from("push_subscriptions")
    .upsert(
      {
        profile_id: profile.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

  if (error) return { error: error.message };
  return { success: true };
}

/** Remove a subscription (e.g. the user disabled notifications). */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase
    .schema("app")
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return { success: true };
}
