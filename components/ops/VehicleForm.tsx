"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createVehicle, updateVehicle } from "@/actions/vehicles";
import type { VehicleRow } from "@/types/domain";

interface SubsidiaryOption {
  id: string;
  name: string;
}

interface VehicleFormProps {
  vehicle?: VehicleRow;
  subsidiaries: SubsidiaryOption[];
  /** Called after a successful save — lets a containing drawer close itself. */
  onSaved?: () => void;
}

const CLASSES = [
  ["tanker", "Tanker"],
  ["truck", "Truck"],
  ["minibus", "Minibus"],
  ["bakkie", "Bakkie / Pickup"],
  ["suv", "SUV"],
  ["sedan", "Sedan"],
  ["farm_vehicle", "Farm vehicle"],
  ["specialist", "Specialist"],
] as const;

const FUELS = [
  ["diesel", "Diesel"],
  ["petrol", "Petrol"],
  ["hybrid", "Hybrid"],
  ["electric", "Electric"],
] as const;

const STATUSES = [
  ["available", "Available"],
  ["maintenance", "Maintenance"],
  ["workshop", "Workshop"],
  ["decommissioned", "Decommissioned"],
] as const;

export function VehicleForm({ vehicle, subsidiaries, onSaved }: VehicleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!vehicle;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const action = isEdit ? updateVehicle : createVehicle;
        const result = await action(fd);
        if (result && "error" in result) {
          toast.error(result.error);
        } else {
          // Previously a successful save gave NO feedback and left a containing
          // drawer open, so it looked like nothing happened.
          toast.success("Vehicle saved");
          router.refresh();
          onSaved?.();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isEdit && <input type="hidden" name="id" value={vehicle.id} />}

      {/* Identification */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Identification
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="plate_number">Plate number *</Label>
            <Input
              id="plate_number"
              name="plate_number"
              defaultValue={vehicle?.plate_number}
              placeholder="AGB 1400"
              className="font-plate"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plate_country">Country *</Label>
            <select
              id="plate_country"
              name="plate_country"
              defaultValue={vehicle?.plate_country ?? "ZW"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              required
            >
              <option value="ZW">Zimbabwe (ZW)</option>
              <option value="ZA">South Africa (ZA)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="vin">VIN / Chassis</Label>
            <Input id="vin" name="vin" defaultValue={vehicle?.vin ?? ""} className="font-plate" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="engine_number">Engine number</Label>
            <Input
              id="engine_number"
              name="engine_number"
              defaultValue={vehicle?.engine_number ?? ""}
              className="font-plate"
            />
          </div>
        </div>
      </fieldset>

      {/* Description */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Description
        </legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="make">Make *</Label>
            <Input id="make" name="make" defaultValue={vehicle?.make} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Model *</Label>
            <Input id="model" name="model" defaultValue={vehicle?.model} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variant">Variant</Label>
            <Input id="variant" name="variant" defaultValue={vehicle?.variant ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="year_of_manufacture">Year</Label>
            <Input
              id="year_of_manufacture"
              name="year_of_manufacture"
              type="number"
              min={1980}
              max={2100}
              defaultValue={vehicle?.year_of_manufacture ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="colour">Colour</Label>
            <Input id="colour" name="colour" defaultValue={vehicle?.colour ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class">Class *</Label>
            <select
              id="class"
              name="class"
              defaultValue={vehicle?.class ?? "sedan"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              required
            >
              {CLASSES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fuel_type">Fuel *</Label>
            <select
              id="fuel_type"
              name="fuel_type"
              defaultValue={vehicle?.fuel_type ?? "diesel"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              required
            >
              {FUELS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fuel_tank_litres">Tank (litres)</Label>
            <Input
              id="fuel_tank_litres"
              name="fuel_tank_litres"
              type="number"
              step="0.1"
              min="0"
              defaultValue={vehicle?.fuel_tank_litres ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={vehicle?.status ?? "available"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {/* 'on_trip' is set by the trip lifecycle, never chosen by hand —
                  but it MUST appear while the vehicle is out, otherwise the
                  select falls back to the first option and saving the form
                  silently frees a vehicle that is still on the road. */}
              {vehicle?.status === "on_trip" && <option value="on_trip">On trip (set by the trip)</option>}
              {STATUSES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            {vehicle?.status === "on_trip" && (
              <p className="text-[11px] text-amber-600">
                This vehicle is out on a trip — leave the status alone unless you know the trip has finished.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Operational */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Operational
        </legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="home_branch">Home branch</Label>
            <Input id="home_branch" name="home_branch" defaultValue={vehicle?.home_branch ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_subsidiary_id">Default subsidiary</Label>
            <select
              id="default_subsidiary_id"
              name="default_subsidiary_id"
              defaultValue={vehicle?.default_subsidiary_id ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— none —</option>
              {subsidiaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acquired_at">Acquired</Label>
            <Input
              id="acquired_at"
              name="acquired_at"
              type="date"
              defaultValue={vehicle?.acquired_at ?? ""}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="current_odometer_km">Odometer (km)</Label>
            <Input
              id="current_odometer_km"
              name="current_odometer_km"
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0}
              className="font-plate"
              defaultValue={vehicle?.current_odometer_km ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service_interval_km">Service interval (km)</Label>
            <Input
              id="service_interval_km"
              name="service_interval_km"
              type="number"
              min={100}
              defaultValue={vehicle?.service_interval_km ?? 5000}
            />
          </div>
        </div>
        <label htmlFor="is_pool" className="flex items-start gap-3 rounded-lg border border-input bg-background p-3 cursor-pointer hover:border-orange-300 transition-colors">
          <input
            id="is_pool"
            name="is_pool"
            type="checkbox"
            defaultChecked={vehicle?.is_pool ?? false}
            className="mt-0.5 h-4 w-4 rounded border-input accent-orange-500"
          />
          <span>
            <span className="block text-sm font-medium">Pool / shared vehicle</span>
            <span className="block text-xs text-muted-foreground">No fixed driver — it belongs to its department and anyone can drive it. The driver is chosen per trip.</span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="condition_notes">Condition notes</Label>
          <textarea
            id="condition_notes"
            name="condition_notes"
            rows={3}
            defaultValue={vehicle?.condition_notes ?? ""}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </fieldset>

      {/* Finance & lifecycle */}
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Finance &amp; lifecycle
        </legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="purchase_cost">Purchase cost</Label>
            <Input
              id="purchase_cost"
              name="purchase_cost"
              type="number"
              step="0.01"
              min="0"
              defaultValue={vehicle?.purchase_cost ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="purchase_currency">Currency</Label>
            <select
              id="purchase_currency"
              name="purchase_currency"
              defaultValue={vehicle?.purchase_currency ?? "USD"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="USD">USD</option>
              <option value="ZAR">ZAR</option>
              <option value="ZWG">ZWG</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salvage_value">Salvage value</Label>
            <Input
              id="salvage_value"
              name="salvage_value"
              type="number"
              step="0.01"
              min="0"
              defaultValue={vehicle?.salvage_value ?? ""}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="useful_life_years">Useful life (years)</Label>
            <Input
              id="useful_life_years"
              name="useful_life_years"
              type="number"
              step="0.5"
              min="0"
              defaultValue={vehicle?.useful_life_years ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="depreciation_method">Depreciation</Label>
            <select
              id="depreciation_method"
              name="depreciation_method"
              defaultValue={vehicle?.depreciation_method ?? "straight_line"}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="straight_line">Straight line</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </fieldset>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          disabled={isPending}
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
        </Button>
        <a href="/vehicles" className="flex items-center text-sm text-muted-foreground hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}
