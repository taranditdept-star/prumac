"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/session";
import { sendPushToManagers, type PushResult } from "@/lib/notifications/push";

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

/**
 * Whether the SERVER can actually send web push — i.e. the VAPID private key
 * (and public key) are present in this deployment's runtime env. The client
 * can subscribe with only the public key, so this catches the common case
 * where the private key wasn't set on the host.
 */
export async function pushServerReady(): Promise<boolean> {
  await requireAuth();
  return Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

/**
 * Fire a real push from the SERVER to all manager/admin devices — the exact
 * path a reported accident uses. Returns a summary so the dashboard can show
 * whether the live server can actually deliver (configured? devices? sent?).
 */
export async function sendTestPush(): Promise<PushResult> {
  await requireRole("fleet_manager", "admin");
  return sendPushToManagers({
    title: "🚨 PRUMAC server test",
    body: "If you see this, the live server can send accident alerts.",
    url: "/live",
    tag: "prumac-server-test",
  });
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
