"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { BellRing, BellOff, Volume2, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import { getPushStatus, enablePush, fireTestAlarm, type PushStatus } from "@/lib/push/client";
import { pushServerReady, sendTestPush } from "@/actions/push";

/**
 * Emergency-alert control for managers/admins. Shows whether push is enabled on
 * this device, lets them enable it, and lets them test the in-app siren (the
 * test click also unlocks browser audio). Self-diagnoses a missing server VAPID
 * config so it's obvious when push hasn't been set up on the host.
 */
export function AlertsStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [pushTesting, setPushTesting] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus);
    pushServerReady().then(setServerReady).catch(() => setServerReady(null));
  }, []);

  function handleEnable() {
    startTransition(async () => {
      const ok = await enablePush();
      setStatus(await getPushStatus());
      if (ok) toast.success("Emergency alerts enabled on this device.");
      else toast.error("Couldn't enable alerts — check your browser's notification permission.");
    });
  }

  // Fires a push from the SERVER (the exact accident path) and reports the
  // outcome — the definitive test of whether the live host can deliver.
  function handleTestPush() {
    setPushTesting(true);
    sendTestPush()
      .then((r) => {
        if (!r.configured) toast.error("Server can't send push — VAPID keys/subject aren't valid on the host.");
        else if (r.total === 0) toast.error("No devices subscribed yet — click Enable first.");
        else if (r.sent > 0) toast.success(`Server push sent to ${r.sent} device${r.sent > 1 ? "s" : ""} — watch for the notification.`);
        else toast.error(`Push failed for all ${r.total} device(s) — check the VAPID config.`);
      })
      .catch(() => toast.error("Test push failed."))
      .finally(() => setPushTesting(false));
  }

  const testPushBtnClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-ink-50 disabled:opacity-50";

  // While we don't know yet, render nothing (avoids a flash).
  if (status === null) return null;

  const enabled = status === "subscribed";

  // Server can't actually send push (VAPID private key missing on the host) —
  // surface it, since the client side can look "enabled" while sends no-op.
  const serverWarn =
    serverReady === false ? (
      <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>Push isn&apos;t fully configured on the server.</b> Devices can subscribe, but accidents
          won&apos;t reach closed apps until <code className="font-mono">VAPID_PRIVATE_KEY</code> and{" "}
          <code className="font-mono">VAPID_SUBJECT</code> are set in Vercel and the app is redeployed.
        </span>
      </div>
    ) : null;

  const wrap = (node: ReactNode) => <div className="space-y-2">{serverWarn}{node}</div>;

  // Compact confirmation strip once enabled.
  if (enabled) {
    return wrap(
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Emergency alerts are on for this device — accidents will ring even when the app is closed.
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestPush}
            disabled={pushTesting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> {pushTesting ? "Sending…" : "Test push"}
          </button>
          <button
            type="button"
            onClick={fireTestAlarm}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <Volume2 className="h-3.5 w-3.5" /> Test alarm
          </button>
        </div>
      </div>
    );
  }

  // Otherwise a fuller prompt with the relevant message + actions.
  const message: Record<Exclude<PushStatus, "subscribed">, { icon: typeof BellOff; text: string }> = {
    default: {
      icon: BellRing,
      text: "Turn on accident alerts so this device rings the moment a driver reports one — even when the app is closed.",
    },
    blocked: {
      icon: BellOff,
      text: "Notifications are blocked for this site. Allow them in your browser's site settings, then enable here.",
    },
    unsupported: {
      icon: AlertTriangle,
      text: "This browser can't receive push alerts. Use Chrome/Edge on Android or desktop, or install the app on iPhone (Add to Home Screen).",
    },
    unconfigured: {
      icon: AlertTriangle,
      text: "Push notifications aren't configured on the server yet. Set the VAPID keys in the Vercel environment to enable closed-app alerts.",
    },
  };
  const m = message[status];
  const Icon = m.icon;

  return wrap(
    <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-orange-200">
          <Icon className="h-5 w-5 text-orange-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900">Emergency accident alerts</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{m.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status === "default" && (
              <button
                type="button"
                onClick={handleEnable}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <BellRing className="h-3.5 w-3.5" /> {pending ? "Enabling…" : "Enable on this device"}
              </button>
            )}
            <button
              type="button"
              onClick={fireTestAlarm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:bg-ink-50"
            >
              <Volume2 className="h-3.5 w-3.5" /> Test alarm sound
            </button>
            <button type="button" onClick={handleTestPush} disabled={pushTesting} className={testPushBtnClass}>
              <Send className="h-3.5 w-3.5" /> {pushTesting ? "Sending…" : "Test push"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
