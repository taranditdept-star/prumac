import "server-only";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Web Push fan-out for emergency alerts. Server-side only — the VAPID private
 * key never reaches the browser. Never throws, so callers can `await` it
 * without risking the originating action.
 */

let configured: boolean | null = null;

/** web-push requires a `mailto:` or `https:` subject; tolerate a bare email. */
function normalizeSubject(raw: string | undefined): string {
  const s = (raw || "").trim();
  if (/^(mailto:|https?:\/\/)/i.test(s)) return s;
  if (s.includes("@")) return `mailto:${s}`;
  return "mailto:admin@prumac.zw";
}

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set — push notifications disabled.");
    configured = false;
    return false;
  }
  try {
    // setVapidDetails throws on a malformed subject or key — never let that
    // bubble into the caller (it would break accident reporting).
    webpush.setVapidDetails(normalizeSubject(process.env.VAPID_SUBJECT), publicKey, privateKey);
    configured = true;
  } catch (e) {
    console.error("[push] invalid VAPID config:", (e as Error)?.message);
    configured = false;
  }
  return configured;
}

export interface PushPayload {
  title: string;
  body?: string;
  /** Path opened when the notification is tapped. */
  url?: string;
  /** Grouping tag; same tag replaces an earlier notification. */
  tag?: string;
}

export interface PushResult {
  configured: boolean;
  total: number;
  sent: number;
  failed: number;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Push to every active fleet_manager / admin. Returns a summary so callers can
 * diagnose (configured? how many devices? how many sent/failed?). Dead
 * subscriptions (404/410) are pruned.
 */
export async function sendPushToManagers(payload: PushPayload): Promise<PushResult> {
  if (!ensureConfigured()) return { configured: false, total: 0, sent: 0, failed: 0 };

  let total = 0;
  let sent = 0;
  let failed = 0;

  try {
    const sb = createServiceClient();

    const { data: managers } = await sb
      .schema("app")
      .from("profiles")
      .select("id")
      .in("role", ["fleet_manager", "admin"])
      .eq("is_active", true)
      .returns<{ id: string }[]>();
    if (!managers || managers.length === 0) return { configured: true, total: 0, sent: 0, failed: 0 };

    const { data: subs } = await sb
      .schema("app")
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in(
        "profile_id",
        managers.map((m) => m.id),
      )
      .returns<SubRow[]>();
    if (!subs || subs.length === 0) return { configured: true, total: 0, sent: 0, failed: 0 };

    total = subs.length;
    const body = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
        } catch (err) {
          failed++;
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await sb.schema("app").from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("[push] send failed", status ?? (err as Error)?.message);
          }
        }
      }),
    );
  } catch (err) {
    console.error("[push] fan-out error", err);
  }

  return { configured: true, total, sent, failed };
}
