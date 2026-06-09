"use client";

import { savePushSubscription } from "@/actions/push";

export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushStatus =
  | "unsupported" // browser/OS can't do web push (or insecure context)
  | "unconfigured" // server VAPID public key missing (not set on Vercel)
  | "blocked" // user denied notifications
  | "default" // supported, not yet enabled
  | "subscribed"; // enabled on this device

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Current web-push status for this device. */
export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (!window.isSecureContext) return "unsupported";
  if (!VAPID_PUBLIC) return "unconfigured";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "default";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "default";
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "default";
  } catch {
    return "default";
  }
}

/** Request permission, subscribe, and persist. Returns true on success. */
export async function enablePush(): Promise<boolean> {
  if (!VAPID_PUBLIC) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
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
  const r = await savePushSubscription({ endpoint: json.endpoint, p256dh, auth, userAgent: navigator.userAgent });
  return "success" in r;
}

/** Fire the in-app test alarm (also serves as the audio-unlock gesture). */
export function fireTestAlarm() {
  window.dispatchEvent(new CustomEvent("prumac:test-alarm"));
}
