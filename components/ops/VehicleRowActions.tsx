"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Pencil, CheckCircle2, Wrench, Hammer, Archive, Trash2, RotateCcw, Fuel, ClipboardCheck } from "lucide-react";
import { RowMenu, type RowAction } from "@/components/primitives/RowMenu";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { VehicleForm } from "@/components/ops/VehicleForm";
import { setVehicleStatus, decommissionVehicle, reinstateVehicle, deleteVehicle } from "@/actions/vehicles";
import type { VehicleRow } from "@/types/domain";

interface VehicleRowActionsProps {
  vehicle: VehicleRow;
  subsidiaries: { id: string; name: string }[];
  isAdmin: boolean;
}

export function VehicleRowActions({ vehicle, subsidiaries, isAdmin }: VehicleRowActionsProps) {
  const vehicleId = vehicle.id;
  const plate = vehicle.plate_number;
  const status = vehicle.status;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<null | "edit" | "decommission" | "delete">(null);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<unknown>, okMsg: string) {
    startTransition(async () => {
      const r = (await fn()) as { error?: string } | undefined;
      if (r?.error) toast.error(r.error);
      else {
        toast.success(okMsg);
        setDrawer(null);
        router.refresh();
      }
    });
  }

  const ic = "h-4 w-4";
  const onTrip = status === "on_trip";
  const decommissioned = status === "decommissioned";

  const actions: RowAction[] = [
    { key: "view", label: "Open vehicle", icon: <ArrowUpRight className={ic} />, href: `/vehicles/${vehicleId}` },
    { key: "edit", label: "Edit vehicle", icon: <Pencil className={ic} />, onSelect: () => setDrawer("edit") },
  ];

  if (!decommissioned) {
    if (status !== "available") {
      actions.push({
        key: "available",
        label: "Mark available",
        icon: <CheckCircle2 className={ic} />,
        separatorBefore: true,
        disabled: onTrip,
        hint: onTrip ? "Out on a trip" : undefined,
        onSelect: () => run(() => setVehicleStatus(vehicleId, "available"), `${plate} is available`),
      });
    }
    if (status !== "maintenance") {
      actions.push({
        key: "maintenance",
        label: "Mark in maintenance",
        icon: <Wrench className={ic} />,
        tone: "warn",
        separatorBefore: status === "available",
        disabled: onTrip,
        hint: onTrip ? "Out on a trip" : undefined,
        onSelect: () => run(() => setVehicleStatus(vehicleId, "maintenance"), `${plate} set to maintenance`),
      });
    }
    if (status !== "workshop") {
      actions.push({
        key: "workshop",
        label: "Send to workshop",
        icon: <Hammer className={ic} />,
        tone: "warn",
        disabled: onTrip,
        hint: onTrip ? "Out on a trip" : undefined,
        onSelect: () => run(() => setVehicleStatus(vehicleId, "workshop"), `${plate} sent to workshop`),
      });
    }
  }

  actions.push(
    { key: "fuel", label: "Fuel logs", icon: <Fuel className={ic} />, separatorBefore: true, href: `/fuel?vehicle=${vehicleId}` },
    { key: "insp", label: "Inspections", icon: <ClipboardCheck className={ic} />, href: `/inspections?vehicle=${vehicleId}` },
  );

  if (decommissioned) {
    actions.push({
      key: "reinstate",
      label: "Reinstate vehicle",
      icon: <RotateCcw className={ic} />,
      separatorBefore: true,
      onSelect: () => run(() => reinstateVehicle(vehicleId), `${plate} is back in the fleet`),
    });
  } else {
    actions.push({
      key: "decommission",
      label: "Decommission",
      icon: <Archive className={ic} />,
      tone: "danger",
      separatorBefore: true,
      hint: "Retire from the fleet",
      onSelect: () => setDrawer("decommission"),
    });
  }

  if (isAdmin) {
    actions.push({
      key: "delete",
      label: "Delete vehicle",
      icon: <Trash2 className={ic} />,
      tone: "danger",
      hint: "Only if it has no history",
      onSelect: () => setDrawer("delete"),
    });
  }

  return (
    <>
      <RowMenu actions={actions} busy={isPending} ariaLabel={`Actions for ${plate}`} />

      <EditDrawer
        open={drawer === "edit"}
        onClose={() => setDrawer(null)}
        title="Edit vehicle"
        subtitle={`${vehicle.make} ${vehicle.model} · ${plate}`}
      >
        <VehicleForm vehicle={vehicle} subsidiaries={subsidiaries} onSaved={() => setDrawer(null)} />
      </EditDrawer>

      <EditDrawer open={drawer === "decommission"} onClose={() => setDrawer(null)} title="Decommission vehicle" subtitle={plate} widthClass="w-full max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Reason *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Sold / written off / beyond economical repair"
              className="mt-1 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </label>
          <p className="text-xs text-ink-500">
            The vehicle keeps all its history but leaves the active fleet. You can reinstate it later.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                toast.error("Give a reason (at least 3 characters).");
                return;
              }
              run(() => decommissionVehicle(vehicleId, reason.trim()), `${plate} decommissioned`);
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-500 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-50"
          >
            {isPending ? "Working…" : "Confirm decommission"}
          </button>
        </div>
      </EditDrawer>

      <EditDrawer open={drawer === "delete"} onClose={() => setDrawer(null)} title="Delete vehicle" subtitle={plate} widthClass="w-full max-w-lg">
        <div className="space-y-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            This permanently removes <span className="font-bold">{plate}</span>. It only works if the vehicle has no
            trips, rates, invoices or assignments — otherwise the database blocks it and you should decommission instead.
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => deleteVehicle(vehicleId), `${plate} deleted`)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </EditDrawer>
    </>
  );
}
