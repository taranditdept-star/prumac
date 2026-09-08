"use client";

import { useState } from "react";
import { Check, Gauge, LockKeyhole } from "lucide-react";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { DriverStartTripForm } from "./DriverStartTripForm";
import type { CountryCode } from "@/types/domain";

export interface AssignedVehicle {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
  default_subsidiary_id: string | null;
}

interface Props {
  vehicles: AssignedVehicle[];
  driverId: string;
  subsidiaries: { id: string; name: string }[];
  agreement: { id: string; title: string; body_md: string } | null;
  /**
   * Vehicles already out on someone else's trip, by id. A pool vehicle may be
   * driven by anyone but only by one person at a time; without this the driver
   * filled in the whole form and only then hit "This vehicle already has an
   * open trip".
   */
  busy?: Record<string, string>;
}

export function StartTripPicker({ vehicles, driverId, subsidiaries, agreement, busy = {} }: Props) {
  const free = vehicles.filter((v) => !busy[v.id]);
  const [selectedId, setSelectedId] = useState<string | null>(
    free.length === 1 ? free[0].id : null,
  );
  const selected = free.find((v) => v.id === selectedId) ?? null;
  const multiple = vehicles.length > 1;

  return (
    <div className="space-y-5">
      {free.length === 0 && vehicles.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-bold text-amber-900">Every vehicle is out right now</p>
          <p className="mt-1 text-xs text-amber-700 leading-relaxed">
            A vehicle becomes free as soon as the driver using it ends their trip. Check back
            shortly, or ask the office.
          </p>
        </div>
      )}
      {multiple ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-2 px-1">
            Which vehicle today?
          </p>
          <div className="grid gap-2">
            {vehicles.map((v) => {
              const active = v.id === selectedId;
              const takenBy = busy[v.id];
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={Boolean(takenBy)}
                  onClick={() => setSelectedId(v.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
                    takenBy
                      ? "border-ink-200/70 bg-ink-50 opacity-70 cursor-not-allowed"
                      : active
                        ? "border-orange-300 bg-gradient-to-br from-orange-50 to-orange-100/40 ring-2 ring-orange-200 active:scale-[0.99]"
                        : "border-ink-200/70 bg-white hover:border-orange-200 active:scale-[0.99]"
                  }`}
                >
                  <PlateBadge plate={v.plate_number} country={v.plate_country} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-900 truncate">
                      {v.make} {v.model}
                    </p>
                    {takenBy ? (
                      <p className="text-xs font-semibold text-amber-700 inline-flex items-center gap-1">
                        <LockKeyhole className="h-3 w-3 shrink-0" />
                        Out with {takenBy}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-500 font-plate inline-flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {v.current_odometer_km.toLocaleString()} km
                      </p>
                    )}
                  </div>
                  {active && !takenBy && (
                    <span className="h-6 w-6 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        selected && (
          <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100/40 border border-orange-200 p-4 flex items-center gap-3">
            <PlateBadge plate={selected.plate_number} country={selected.plate_country} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink-900">
                {selected.make} {selected.model}
              </p>
              <p className="text-xs text-ink-500 font-plate">
                {selected.current_odometer_km.toLocaleString()} km
              </p>
            </div>
          </div>
        )
      )}

      {selected ? (
        <DriverStartTripForm
          key={selected.id}
          vehicleId={selected.id}
          driverId={driverId}
          subsidiaries={subsidiaries}
          defaultSubsidiaryId={selected.default_subsidiary_id}
          currentOdometer={selected.current_odometer_km}
          agreement={agreement}
        />
      ) : (
        <p className="text-sm text-ink-500 px-1">Select a vehicle above to continue.</p>
      )}
    </div>
  );
}
