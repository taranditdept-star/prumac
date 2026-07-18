"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck, Check, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { markAttendance } from "@/actions/attendance";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Harare",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Harare",
  });
}

export function AttendanceControl({
  initialMarkedAt,
  todayLabel,
}: {
  initialMarkedAt: string | null;
  todayLabel: string;
}) {
  const [markedAt, setMarkedAt] = useState<string | null>(initialMarkedAt);
  const [justMarked, setJustMarked] = useState(false);
  const [isPending, startTransition] = useTransition();

  // After the celebratory confirmation, settle into the compact "checked in"
  // chip so the driver is left on their home screen, ready to start a trip.
  useEffect(() => {
    if (!justMarked) return;
    const t = setTimeout(() => setJustMarked(false), 3500);
    return () => clearTimeout(t);
  }, [justMarked]);

  function mark() {
    startTransition(async () => {
      const r = await markAttendance();
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setMarkedAt(r.markedAt);
      setJustMarked(true);
      toast.success(r.alreadyMarked ? "Already checked in today" : "Attendance marked");
    });
  }

  // ── Just marked — celebratory confirmation (auto-collapses) ───────────────
  if (justMarked && markedAt) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg shadow-emerald-600/20">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight">You&rsquo;re checked in ✓</p>
            <p className="text-sm text-white/90">{fmtDate(markedAt)}</p>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-4 w-4" /> {fmtTime(markedAt)}
            </p>
          </div>
        </div>
        <p className="relative mt-3 text-xs text-white/80">
          Have a safe day — you can start your trip now.
        </p>
      </div>
    );
  }

  // ── Already marked — compact chip ─────────────────────────────────────────
  if (markedAt) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white">
          <Check className="h-5 w-5" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900">Attendance marked for today</p>
          <p className="text-xs text-emerald-700">Checked in at {fmtTime(markedAt)}</p>
        </div>
      </div>
    );
  }

  // ── Not marked — the call to action ───────────────────────────────────────
  return (
    <button
      type="button"
      onClick={mark}
      disabled={isPending}
      className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 p-4 text-left text-white shadow-lg shadow-orange-600/20 transition-transform active:scale-[0.99] disabled:opacity-70"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
        {isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <CalendarCheck className="h-6 w-6" />}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-base font-extrabold leading-tight">
          {isPending ? "Marking…" : "Mark Attendance"}
        </p>
        <p className="text-xs text-white/85">Check in for today · {todayLabel}</p>
      </div>
      <span className="relative hidden shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-orange-600 sm:block">
        {isPending ? "…" : "Check in"}
      </span>
    </button>
  );
}
