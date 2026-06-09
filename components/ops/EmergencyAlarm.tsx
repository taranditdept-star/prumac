"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertOctagon, MapPin, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AccidentAlert {
  id: string;
  title: string;
  body: string | null;
  accident_id: string | null;
}

/**
 * In-app emergency alarm. While a manager/admin has the dashboard open, a new
 * `accident_reported` alert (raised the instant a driver submits an accident)
 * triggers a loud looping siren + a full-screen overlay that won't go away
 * until acknowledged. Complements the Web Push that fires when the app is
 * closed.
 *
 * The siren is synthesised with the Web Audio API (no asset to load). Browsers
 * block audio until the user has interacted with the page, so we lazily create
 * and resume an AudioContext on the first pointer/key event.
 */
export function EmergencyAlarm() {
  const [active, setActive] = useState<AccidentAlert | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopSirenRef = useRef<(() => void) | null>(null);

  // Prime audio on first interaction so the siren can play later. Browsers
  // unlock audio only inside a user-gesture handler, so we listen broadly.
  useEffect(() => {
    const prime = () => {
      if (!audioCtxRef.current) {
        try {
          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctx) audioCtxRef.current = new Ctx();
        } catch {
          /* no audio available */
        }
      }
      audioCtxRef.current?.resume().catch(() => {});
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "click"];
    for (const ev of events) window.addEventListener(ev, prime);
    return () => {
      for (const ev of events) window.removeEventListener(ev, prime);
    };
  }, []);

  const startSiren = useCallback(() => {
    // Create the context lazily if the manager hasn't interacted yet (may be
    // suspended until a gesture, but worth attempting).
    if (!audioCtxRef.current) {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      } catch {
        /* no audio */
      }
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    ctx.resume().catch(() => {});
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      gain.gain.value = 0.16;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      // Two-tone wail: alternate the pitch on a timer.
      let high = false;
      const id = window.setInterval(() => {
        osc.frequency.setValueAtTime(high ? 950 : 640, ctx.currentTime);
        high = !high;
      }, 500);
      osc.frequency.setValueAtTime(640, ctx.currentTime);
      stopSirenRef.current = () => {
        window.clearInterval(id);
        try {
          gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
          osc.stop(ctx.currentTime + 0.2);
        } catch {
          /* already stopped */
        }
      };
    } catch {
      /* audio failed — the visual overlay still shows */
    }
  }, []);

  const stopSiren = useCallback(() => {
    stopSirenRef.current?.();
    stopSirenRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    stopSiren();
    setActive(null);
  }, [stopSiren]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("emergency-accidents")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "app", table: "alerts" },
        (payload) => {
          const row = payload.new as {
            id: string;
            kind: string;
            title: string;
            body: string | null;
            accident_id: string | null;
          };
          // Only accidents trigger the emergency alarm (matches the proven
          // AlertsPanel client-side filter — no reliance on a server filter).
          if (row.kind !== "accident_reported") return;
          setActive({
            id: row.id,
            title: row.title,
            body: row.body,
            accident_id: row.accident_id,
          });
          try {
            navigator.vibrate?.([400, 200, 400, 200, 600]);
          } catch {
            /* unsupported */
          }
          startSiren();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      stopSiren();
    };
  }, [startSiren, stopSiren]);

  if (!active) return null;

  const href = active.accident_id ? `/accidents/${active.accident_id}` : "/accidents";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-rose-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 bg-gradient-to-r from-rose-600 to-red-600 px-6 py-5">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-white/30" />
            <AlertOctagon className="relative h-6 w-6 text-white" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-rose-100">
              Emergency · Accident reported
            </p>
            <p className="text-lg font-extrabold leading-tight text-white">{active.title}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          {active.body && <p className="text-sm leading-relaxed text-ink-700">{active.body}</p>}

          <div className="mt-5 flex items-center gap-2">
            <Link
              href={href}
              onClick={dismiss}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700"
            >
              <MapPin className="h-4 w-4" />
              View accident
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
            >
              <Volume2 className="h-4 w-4" />
              Silence
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
