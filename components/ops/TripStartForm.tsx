"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Truck, User, Building2, MapPin } from "lucide-react";
import { startTrip } from "@/actions/trips";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

interface VehicleOpt {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
  default_subsidiary_id: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
}

interface DriverOpt {
  id: string;
  full_name: string;
  vehicle_id: string | null;
}

interface SubsidiaryOpt {
  id: string;
  name: string;
}

interface TripStartFormProps {
  vehicles: VehicleOpt[];
  drivers: DriverOpt[];
  subsidiaries: SubsidiaryOpt[];
}

const PURPOSES = [
  ["delivery", "Delivery"],
  ["sales", "Sales"],
  ["collection", "Collection"],
  ["maintenance_run", "Maintenance run"],
  ["admin", "Admin"],
  ["personal", "Personal (approved)"],
  ["other", "Other"],
] as const;

export function TripStartForm({ vehicles, drivers, subsidiaries }: TripStartFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehicleId, setVehicleId] = useState<string>("");
  const [driverId, setDriverId] = useState<string>("");
  const [subId, setSubId] = useState<string>("");
  const [odometer, setOdometer] = useState<string>("");

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId),
    [vehicles, vehicleId],
  );

  // When a vehicle is picked, prefill the assigned driver, default subsidiary, and current odometer
  function onPickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      if (v.driver_id) setDriverId(v.driver_id);
      if (v.default_subsidiary_id) setSubId(v.default_subsidiary_id);
      setOdometer(String(v.current_odometer_km));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await startTrip(fd);
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
          toast.error(err.message);
        }
      }
    });
  }

  const inputCls =
    "h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Vehicle picker */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="h-4 w-4 text-orange-600" />
          <h2 className="text-base font-bold text-ink-900">Vehicle</h2>
        </div>
        <select
          name="vehicle_id"
          value={vehicleId}
          onChange={(e) => onPickVehicle(e.target.value)}
          className={selectCls}
          required
        >
          <option value="">— select a vehicle —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.plate_number} · {v.make} {v.model} ({v.current_odometer_km.toLocaleString()} km)
            </option>
          ))}
        </select>
        {selectedVehicle && (
          <div className="mt-4 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/40 border border-orange-200 p-3 flex items-center gap-3">
            <PlateBadge
              plate={selectedVehicle.plate_number}
              country={selectedVehicle.plate_country}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-900">
                {selectedVehicle.make} {selectedVehicle.model}
              </p>
              <p className="text-xs text-ink-500 font-plate">
                Last reading: {selectedVehicle.current_odometer_km.toLocaleString()} km
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Driver + subsidiary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-sky-600" />
            <h2 className="text-base font-bold text-ink-900">Driver</h2>
          </div>
          <select
            name="driver_id"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className={selectCls}
            required
          >
            <option value="">— select a driver —</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-violet-600" />
            <h2 className="text-base font-bold text-ink-900">Bill to subsidiary</h2>
          </div>
          <select
            name="subsidiary_id"
            value={subId}
            onChange={(e) => setSubId(e.target.value)}
            className={selectCls}
            required
          >
            <option value="">— select a subsidiary —</option>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Route & purpose */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-emerald-600" />
          <h2 className="text-base font-bold text-ink-900">Route</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Origin
            </Label>
            <input name="origin_label" placeholder="Harare CBD" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Destination
            </Label>
            <input name="destination_label" placeholder="Sherwood Farm" className={inputCls} />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Route description
          </Label>
          <input
            name="route_description"
            placeholder="REDCLIFF-SHERWOOD FARM"
            className={inputCls}
          />
        </div>
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Purpose
          </Label>
          <select name="purpose" defaultValue="delivery" className={selectCls}>
            {PURPOSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Odometer */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
        <h2 className="text-base font-bold text-ink-900 mb-4">Start odometer</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Reading (km) <span className="text-orange-500">*</span>
            </Label>
            <Input
              name="start_odometer_km"
              type="number"
              min={0}
              step={1}
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className={inputCls + " font-plate text-base"}
              required
            />
          </div>
          {selectedVehicle && (
            <div className="text-xs text-ink-500 pb-2">
              Last: {selectedVehicle.current_odometer_km.toLocaleString()} km
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-10 px-4 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          Cancel
        </button>
        <Button
          type="submit"
          disabled={isPending}
          className="h-10 px-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 transition-all"
        >
          {isPending ? "Starting trip…" : "Start trip"}
        </Button>
      </div>
    </form>
  );
}
