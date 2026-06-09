import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Web Push fan-out for emergency alerts.
 *
 * Sends a push notification to every active manager/admin device that has
 * opted in (rows in app.push_subscriptions). Runs server-side only; the
 * VAPID private key never reaches the browser. If VAPID keys are not
 * configured the calls become no-ops so the rest of the app keeps working.
 */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set — push notifications disabled.");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@prumac.zw",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  /** Path opened when the notification is tapped. */
  url?: string;
  /** Grouping tag; same tag replaces an earlier notification. */
  tag?: string;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Push to every active fleet_manager / admin. Best-effort: individual send
 * failures are swallowed, and subscriptions the push service reports as gone
 * (404/410) are pruned. Never throws — callers can `await` it without risk.
 */
export async function sendPushToManagers(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const sb = createServiceClient();

    const { data: managers } = await sb
      .schema("app")
      .from("profiles")
      .select("id")
      .in("role", ["fleet_manager", "admin"])
      .eq("is_active", true)
      .returns<{ id: string }[]>();
    if (!managers || managers.length === 0) return;

    const { data: subs } = await sb
      .schema("app")
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in(
        "profile_id",
        managers.map((m) => m.id),
      )
      .returns<SubRow[]>();
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            // Subscription expired / unsubscribed — remove it.
            await sb.schema("app").from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("[push] send failed", status ?? err);
          }
        }
      }),
    );
  } catch (err) {
    // Never let alerting break the originating action.
    console.error("[push] fan-out error", err);
  }
}
