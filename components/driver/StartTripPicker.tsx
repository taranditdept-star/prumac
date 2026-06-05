"use client";

import { useState } from "react";
import { Check, Gauge } from "lucide-react";
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
}

export function StartTripPicker({ vehicles, driverId, subsidiaries }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    vehicles.length === 1 ? vehicles[0].id : null,
  );
  const selected = vehicles.find((v) => v.id === selectedId) ?? null;
  const multiple = vehicles.length > 1;

  return (
    <div className="space-y-5">
      {multiple ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-2 px-1">
            Which vehicle today?
          </p>
          <div className="grid gap-2">
            {vehicles.map((v) => {
              const active = v.id === selectedId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-orange-300 bg-gradient-to-br from-orange-50 to-orange-100/40 ring-2 ring-orange-200"
                      : "border-ink-200/70 bg-white hover:border-orange-200"
                  }`}
                >
                  <PlateBadge plate={v.plate_number} country={v.plate_country} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-900 truncate">
                      {v.make} {v.model}
                    </p>
                    <p className="text-xs text-ink-500 font-plate inline-flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      {v.current_odometer_km.toLocaleString()} km
                    </p>
                  </div>
                  {active && (
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
        />
      ) : (
        <p className="text-sm text-ink-500 px-1">Select a vehicle above to continue.</p>
      )}
    </div>
  );
}
