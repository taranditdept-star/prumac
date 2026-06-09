"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { savePushSubscription } from "@/actions/push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back it with a concrete ArrayBuffer so it satisfies BufferSource (not the
  // wider ArrayBufferLike that includes SharedArrayBuffer).
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Subscribe via the active service worker and persist the subscription. */
async function subscribeAndSave(): Promise<boolean> {
  if (!VAPID_PUBLIC) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return false;
  const r = await savePushSubscription({
    endpoint: json.endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent,
  });
  return "success" in r;
}

type State = "hidden" | "prompt";

/**
 * Opt-in card for emergency push notifications. Shown to managers/admins whose
 * browser supports Web Push and hasn't granted/denied permission yet. Once
 * granted, it silently keeps the subscription registered on each visit (e.g.
 * after a redeploy rotates the SW). Push delivery needs the service worker,
 * which only registers in a production build over HTTPS/localhost.
 */
export function PushAlerts() {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    // SW only registers in production; push is meaningless without it.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !window.isSecureContext) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (!VAPID_PUBLIC) return;

    const perm = Notification.permission;
    if (perm === "granted") {
      subscribeAndSave().catch(() => {});
      return;
    }
    if (perm === "denied") return;
    // 'default' — invite the user, unless they dismissed it this session.
    if (sessionStorage.getItem("push-prompt-dismissed") !== "1") setState("prompt");
  }, []);

  const enable = useCallback(async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("hidden");
        if (perm === "denied") {
          toast.error("Alerts blocked. Enable notifications for this site in your browser settings.");
        }
        return;
      }
      const ok = await subscribeAndSave();
      setState("hidden");
      if (ok) toast.success("Emergency alerts enabled on this device.");
      else toast.error("Couldn't enable alerts on this device.");
    } catch {
      setState("hidden");
      toast.error("Couldn't enable alerts on this device.");
    }
  }, []);

  const dismiss = useCallback(() => {
    sessionStorage.setItem("push-prompt-dismissed", "1");
    setState("hidden");
  }, []);

  if (state !== "prompt") return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-orange-200 bg-white p-4 shadow-xl shadow-orange-900/10">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 ring-1 ring-orange-200">
          <BellRing className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">Enable emergency alerts</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Ring this device the moment a driver reports an accident — even when the app is closed.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded-lg p-1 text-ink-400 hover:text-ink-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
