"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight, Pencil, Pause, Play, Square, CheckCircle2, Lock, Unlock, XCircle, RefreshCw,
} from "lucide-react";
import { RowMenu, type RowAction } from "@/components/primitives/RowMenu";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { TripEditForm } from "@/components/ops/TripEditForm";
import {
  pauseTrip, resumeTrip, endTrip, completeTrip, cancelTrip, suspendTrip, unsuspendTrip, reconcileTrip,
} from "@/actions/trips";
import type { TripStatus } from "@/types/domain";

interface TripRowActionsProps {
  tripId: string;
  status: TripStatus;
  isManager: boolean;
  label: string;
  purpose: string;
  purposeDetail?: string | null;
  routeDescription: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  fuelLitres: number | null;
  fuelAmount: number | null;
  loadCount: number | null;
}

type Drawer = null | "edit" | "end" | "cancel";

export function TripRowActions(props: TripRowActionsProps) {
  const { tripId, status, isManager, label } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [endOdo, setEndOdo] = useState(props.startOdometer != null ? String(props.startOdometer) : "");
  // Pre-fill from what the trip already has — submitting always writes these
  // three fields, so blank inputs would wipe fuel/load figures already recorded.
  const [fuelL, setFuelL] = useState(props.fuelLitres != null ? String(props.fuelLitres) : "");
  const [fuelA, setFuelA] = useState(props.fuelAmount != null ? String(props.fuelAmount) : "");
  const [loads, setLoads] = useState(props.loadCount != null ? String(props.loadCount) : "");
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<unknown>, okMsg: string) {
    startTransition(async () => {
      try {
        const r = (await fn()) as { error?: string } | undefined;
        if (r?.error) toast.error(r.error);
        else {
          toast.success(okMsg);
          setDrawer(null);
          router.refresh();
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes("NEXT_REDIRECT")) toast.error(e.message);
      }
    });
  }

  function submitEnd() {
    if (!endOdo.trim()) {
      toast.error("Enter the end odometer.");
      return;
    }
    const fd = new FormData();
    fd.set("trip_id", tripId);
    fd.set("end_odometer_km", endOdo);
    fd.set("fuel_litres", fuelL);
    fd.set("fuel_amount", fuelA);
    fd.set("load_count", loads);
    run(() => endTrip(fd), "Trip ended and completed");
  }

  function submitCancel() {
    if (reason.trim().length < 3) {
      toast.error("Give a reason (at least 3 characters).");
      return;
    }
    const fd = new FormData();
    fd.set("trip_id", tripId);
    fd.set("reason", reason);
    run(() => cancelTrip(fd), "Trip cancelled");
  }

  const live = status === "in_progress" || status === "paused";
  // Cancellable states only. 'ended' is excluded: the DB state machine allows
  // ended → completed ONLY, so offering Cancel there would just raise a raw
  // check_violation.
  const cancellable = live || status === "suspended" || status === "planned";
  const ic = "h-4 w-4";

  const actions: RowAction[] = [
    { key: "view", label: "View trip", icon: <ArrowUpRight className={ic} />, href: `/trips/${tripId}` },
    { key: "edit", label: "Edit details", icon: <Pencil className={ic} />, onSelect: () => setDrawer("edit") },
  ];

  if (status === "in_progress") {
    actions.push({ key: "pause", label: "Pause trip", icon: <Pause className={ic} />, tone: "warn", separatorBefore: true, onSelect: () => run(() => pauseTrip(tripId), "Trip paused") });
  }
  if (status === "paused") {
    actions.push({ key: "resume", label: "Resume trip", icon: <Play className={ic} />, separatorBefore: true, onSelect: () => run(() => resumeTrip(tripId), "Trip resumed") });
  }
  if (live) {
    actions.push({ key: "end", label: "End trip", icon: <Square className={ic} />, hint: "Records end odometer", onSelect: () => setDrawer("end") });
    if (isManager) {
      actions.push({ key: "suspend", label: "Suspend trip", icon: <Lock className={ic} />, tone: "warn", hint: "Driver can't resume it", onSelect: () => run(() => suspendTrip(tripId), "Trip suspended") });
    }
  }
  if (status === "suspended" && isManager) {
    actions.push({ key: "lift", label: "Lift suspension", icon: <Unlock className={ic} />, separatorBefore: true, onSelect: () => run(() => unsuspendTrip(tripId), "Suspension lifted") });
  }
  if (status === "ended" && isManager) {
    actions.push({ key: "complete", label: "Mark completed", icon: <CheckCircle2 className={ic} />, separatorBefore: true, onSelect: () => run(() => completeTrip(tripId), "Trip completed") });
  }
  if (status === "completed" && isManager) {
    actions.push({ key: "recon", label: "Re-run reconciliation", icon: <RefreshCw className={ic} />, separatorBefore: true, onSelect: () => run(() => reconcileTrip(tripId), "Reconciliation re-run") });
  }
  if (cancellable) {
    // Cancel is the destructive action for a trip. A hard delete is deliberately
    // not offered: it would cascade away GPS pings, inspections, reconciliation
    // and alert history, and invoiced trips are blocked by the database anyway.
    actions.push({ key: "cancel", label: "Cancel trip", icon: <XCircle className={ic} />, tone: "danger", separatorBefore: true, hint: "Needs a reason", onSelect: () => setDrawer("cancel") });
  }

  const fieldCls =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm font-plate focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

  return (
    <>
      <RowMenu actions={actions} busy={isPending} ariaLabel={`Actions for ${label}`} />

      <EditDrawer open={drawer === "edit"} onClose={() => setDrawer(null)} title="Edit trip details" subtitle={label}>
        <TripEditForm
          tripId={tripId}
          purpose={props.purpose}
          purposeDetail={props.purposeDetail}
          routeDescription={props.routeDescription}
          originLabel={props.originLabel}
          destinationLabel={props.destinationLabel}
          startOdometer={props.startOdometer}
          endOdometer={props.endOdometer}
          fuelLitres={props.fuelLitres}
          fuelAmount={props.fuelAmount}
          loadCount={props.loadCount}
          embedded
          onClose={() => setDrawer(null)}
        />
      </EditDrawer>

      <EditDrawer open={drawer === "end"} onClose={() => setDrawer(null)} title="End trip" subtitle={label} widthClass="w-full max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">End odometer (km) *</span>
            <input type="number" inputMode="numeric" value={endOdo} onChange={(e) => setEndOdo(e.target.value)} className={`mt-1 ${fieldCls}`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Fuel (L)</span>
              <input type="number" step="0.1" value={fuelL} onChange={(e) => setFuelL(e.target.value)} placeholder="—" className={`mt-1 ${fieldCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Fuel cost</span>
              <input type="number" step="0.01" value={fuelA} onChange={(e) => setFuelA(e.target.value)} placeholder="—" className={`mt-1 ${fieldCls}`} />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Loads carried</span>
            <input type="number" value={loads} onChange={(e) => setLoads(e.target.value)} placeholder="For per-load billing" className={`mt-1 ${fieldCls}`} />
          </label>
          <p className="text-xs text-ink-500">Ending a trip also completes it, frees the vehicle and runs reconciliation.</p>
          <button
            type="button"
            onClick={submitEnd}
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-violet-500 text-sm font-bold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            {isPending ? "Ending…" : "Confirm end"}
          </button>
        </div>
      </EditDrawer>

      <EditDrawer open={drawer === "cancel"} onClose={() => setDrawer(null)} title="Cancel trip" subtitle={label} widthClass="w-full max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Cancellation reason *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Mechanical breakdown before departure"
              className="mt-1 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </label>
          <p className="text-xs text-ink-500">
            The trip is kept for the record (with its history) and marked cancelled — it is never deleted.
          </p>
          <button
            type="button"
            onClick={submitCancel}
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-500 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50"
          >
            {isPending ? "Cancelling…" : "Confirm cancel"}
          </button>
        </div>
      </EditDrawer>
    </>
  );
}
