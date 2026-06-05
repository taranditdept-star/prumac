"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Pause, Play, Square, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { pauseTrip, resumeTrip, endTrip, completeTrip, cancelTrip } from "@/actions/trips";
import type { TripStatus } from "@/types/domain";

interface TripActionsProps {
  tripId: string;
  status: TripStatus;
  startOdometer: number | null;
  isManager: boolean;
}

export function TripActions({ tripId, status, startOdometer, isManager }: TripActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showEndForm, setShowEndForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);

  function call(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        const r = (await fn()) as { error?: string; success?: boolean };
        if (r?.error) toast.error(r.error);
        else {
          toast.success("Done");
          router.refresh();
          setShowEndForm(false);
          setShowCancelForm(false);
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  function handleEnd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("trip_id", tripId);
    call(() => endTrip(fd));
  }

  function handleCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("trip_id", tripId);
    call(() => cancelTrip(fd));
  }

  if (status === "completed" || status === "cancelled") {
    return (
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <p className="text-sm text-ink-500 text-center">
          {status === "completed" ? "✓ Trip completed." : "Trip cancelled."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-3">
      <h2 className="text-base font-bold text-ink-900 mb-2">Actions</h2>

      {/* In progress: pause / end / cancel */}
      {status === "in_progress" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => call(() => pauseTrip(tripId))}
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Pause className="h-4 w-4" /> Pause trip
          </button>
          <button
            type="button"
            onClick={() => setShowEndForm(!showEndForm)}
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-violet-500/30 transition-all disabled:opacity-50"
          >
            <Square className="h-4 w-4" /> End trip
          </button>
        </div>
      )}

      {/* Paused: resume / end / cancel */}
      {status === "paused" && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => call(() => resumeTrip(tripId))}
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-sky-500/30 transition-all disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Resume trip
          </button>
          <button
            type="button"
            onClick={() => setShowEndForm(!showEndForm)}
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Square className="h-4 w-4" /> End trip
          </button>
        </div>
      )}

      {/* Ended → only manager can complete */}
      {status === "ended" && isManager && (
        <button
          type="button"
          onClick={() => call(() => completeTrip(tripId))}
          disabled={isPending}
          className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/30 transition-all disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" /> Mark completed
        </button>
      )}

      {status === "ended" && !isManager && (
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <p className="text-xs text-violet-700">
            Awaiting fleet manager review to mark completed.
          </p>
        </div>
      )}

      {/* End trip form */}
      {showEndForm && (
        <form onSubmit={handleEnd} className="mt-4 pt-4 border-t border-ink-100 space-y-3">
          <div>
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              End odometer (km) *
            </Label>
            <Input
              name="end_odometer_km"
              type="number"
              min={startOdometer ?? 0}
              defaultValue={startOdometer ?? undefined}
              required
              className="mt-1 font-plate"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                Fuel uplift (L)
              </Label>
              <Input name="fuel_litres" type="number" step="0.1" min={0} className="mt-1 font-plate" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                Fuel cost
              </Label>
              <Input name="fuel_amount" type="number" step="0.01" min={0} className="mt-1 font-plate" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
            >
              {isPending ? "Ending…" : "Confirm end"}
            </Button>
            <button
              type="button"
              onClick={() => setShowEndForm(false)}
              className="px-4 text-sm text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Cancel button & form */}
      {!showCancelForm ? (
        <button
          type="button"
          onClick={() => setShowCancelForm(true)}
          disabled={isPending}
          className="w-full h-9 rounded-xl bg-white hover:bg-rose-50 border border-ink-200 hover:border-rose-200 text-rose-600 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" /> Cancel trip
        </button>
      ) : (
        <form onSubmit={handleCancel} className="mt-4 pt-4 border-t border-ink-100 space-y-3">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Cancellation reason *
          </Label>
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="e.g. Mechanical breakdown before departure"
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500/40"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
            >
              {isPending ? "Cancelling…" : "Confirm cancel"}
            </Button>
            <button
              type="button"
              onClick={() => setShowCancelForm(false)}
              className="px-4 text-sm text-ink-500 hover:text-ink-900"
            >
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
