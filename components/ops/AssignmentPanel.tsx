"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, X, Plus } from "lucide-react";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { assignVehicle, endAssignment } from "@/actions/drivers";
import type { CountryCode } from "@/types/domain";

interface VehicleOption {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  status: string;
  currentDriver?: string | null;
}

interface AssignmentItem {
  id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  vehicles: {
    plate_number: string;
    plate_country: CountryCode;
    make: string;
    model: string;
  } | null;
}

interface AssignmentPanelProps {
  driverId: string;
  current: AssignmentItem | null;
  history: AssignmentItem[];
  availableVehicles: VehicleOption[];
}

export function AssignmentPanel({
  driverId,
  current,
  history,
  availableVehicles,
}: AssignmentPanelProps) {
  const [picking, setPicking] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAssign(vehicleId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("driver_id", driverId);
      fd.set("vehicle_id", vehicleId);
      const result = await assignVehicle(fd);
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Vehicle assigned");
        setPicking(false);
      }
    });
  }

  function handleEnd(assignmentId: string) {
    startTransition(async () => {
      const result = await endAssignment(assignmentId);
      if ("error" in result) toast.error(result.error);
      else toast.success("Assignment ended");
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-ink-900">Vehicle assignment</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Current and historical vehicle assignments
          </p>
        </div>
        {!picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 shadow-sm shadow-orange-200 transition-all"
          >
            <Plus className="h-4 w-4" />
            {current ? "Change vehicle" : "Assign vehicle"}
          </button>
        )}
      </div>

      {/* Current */}
      {current && current.vehicles ? (
        <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 border border-orange-200 p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
            <Truck className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PlateBadge
                plate={current.vehicles.plate_number}
                country={current.vehicles.plate_country}
                size="sm"
              />
              <span className="text-xs text-emerald-700 font-bold inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-900">
              {current.vehicles.make} {current.vehicles.model}
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              Since {new Date(current.started_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleEnd(current.id)}
            disabled={isPending}
            className="h-9 w-9 rounded-xl bg-white hover:bg-rose-50 border border-ink-200 hover:border-rose-200 flex items-center justify-center text-ink-400 hover:text-rose-600 transition-all"
            aria-label="End assignment"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : !picking ? (
        <div className="rounded-xl bg-ink-50/50 border border-dashed border-ink-200 py-8 text-center">
          <div className="inline-flex h-12 w-12 rounded-xl bg-white items-center justify-center mb-2 ring-1 ring-ink-100">
            <Truck className="h-5 w-5 text-ink-400" />
          </div>
          <p className="text-sm font-medium text-ink-700">No vehicle assigned</p>
          <p className="text-xs text-ink-500 mt-0.5">Assign a vehicle to this driver.</p>
        </div>
      ) : null}

      {/* Picker */}
      {picking && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-800">Pick an available vehicle</p>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="text-xs text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {availableVehicles.length === 0 ? (
              <p className="text-sm text-ink-500 italic px-3 py-2">
                No vehicles available to assign.
              </p>
            ) : (
              availableVehicles.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAssign(v.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-ink-200 hover:border-orange-300 hover:bg-orange-50/50 transition-all text-left disabled:opacity-50"
                >
                  <PlateBadge
                    plate={v.plate_number}
                    country={v.plate_country}
                    size="sm"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-900 truncate">
                      {v.make} {v.model}
                    </span>
                    {v.currentDriver && (
                      <span className="block text-[11px] text-amber-600 truncate">
                        Currently: {v.currentDriver} — assigning reassigns it
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-500 capitalize shrink-0">{v.status}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-6 pt-5 border-t border-ink-100">
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-ink-400 mb-3">
            Previous assignments
          </p>
          <div className="space-y-2">
            {history.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-ink-50 transition-colors"
              >
                {a.vehicles && (
                  <PlateBadge
                    plate={a.vehicles.plate_number}
                    country={a.vehicles.plate_country}
                    size="sm"
                  />
                )}
                <span className="text-xs text-ink-600 flex-1 truncate">
                  {a.vehicles?.make} {a.vehicles?.model}
                </span>
                <span className="text-[11px] text-ink-400 font-plate">
                  {new Date(a.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  {" → "}
                  {a.ended_at
                    ? new Date(a.ended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : "now"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
