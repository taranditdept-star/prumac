"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createTyre } from "@/actions/tyres";
import type { CountryCode } from "@/types/domain";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

interface VehicleOption {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
}

export function TyreForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState("in_store");
  const inService = status === "in_service";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createTyre(fd);
      if (r && "error" in r) toast.error(r.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Tyre
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="serial_number">Serial number</Label>
            <Input id="serial_number" name="serial_number" className="font-plate" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="size">Size</Label>
            <Input id="size" name="size" placeholder="11R22.5" className="font-plate" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" name="brand" placeholder="Michelin" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pattern">Pattern</Label>
            <Input id="pattern" name="pattern" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="tread_depth_mm">Tread (mm)</Label>
            <Input id="tread_depth_mm" name="tread_depth_mm" type="number" step="0.1" min="0" max="40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cost">Cost</Label>
            <Input id="cost" name="cost" type="number" step="0.01" min="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select id="currency" name="currency" className={SELECT} defaultValue="USD">
              <option value="USD">USD</option>
              <option value="ZAR">ZAR</option>
              <option value="ZWG">ZWG</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Placement
        </legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              className={SELECT}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="in_store">In store</option>
              <option value="spare">Spare</option>
              <option value="in_service">In service (fitted)</option>
              <option value="scrapped">Scrapped</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicle_id">Vehicle {inService && "*"}</Label>
            <select id="vehicle_id" name="vehicle_id" className={SELECT} defaultValue="" required={inService}>
              <option value="">— none —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.plate_country})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="position">Position {inService && "*"}</Label>
            <Input id="position" name="position" placeholder="FL, FR, RL1…" className="font-plate" required={inService} />
          </div>
        </div>
        {inService && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fitted_at">Fitted on</Label>
              <Input id="fitted_at" name="fitted_at" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fitted_odometer_km">Fitted odometer (km)</Label>
              <Input id="fitted_odometer_km" name="fitted_odometer_km" type="number" min={0} className="font-plate" />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </fieldset>

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isPending}>
          {isPending ? "Saving…" : "Add tyre"}
        </Button>
        <a href="/tyres" className="flex items-center text-sm text-muted-foreground hover:underline">
          Cancel
        </a>
      </div>
    </form>
  );
}
