"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Gauge, Camera, Lock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startTrip } from "@/actions/trips";

interface DriverStartTripFormProps {
  vehicleId: string;
  driverId: string;
  subsidiaries: { id: string; name: string }[];
  defaultSubsidiaryId: string | null;
  currentOdometer: number;
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

export function DriverStartTripForm({
  vehicleId,
  driverId,
  subsidiaries,
  defaultSubsidiaryId,
  currentOdometer,
}: DriverStartTripFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPhotoUrl(file ? URL.createObjectURL(file) : null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicleId);
    fd.set("driver_id", driverId);
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
    "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Bill to *
        </Label>
        <select
          name="subsidiary_id"
          defaultValue={defaultSubsidiaryId ?? ""}
          className={selectCls}
          required
        >
          <option value="">— select —</option>
          {subsidiaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
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

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Route
        </Label>
        <input
          name="route_description"
          placeholder="REDCLIFF-SHERWOOD FARM"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">From</Label>
          <input name="origin_label" placeholder="Harare" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">To</Label>
          <input name="destination_label" placeholder="Bulawayo" className={inputCls} />
        </div>
      </div>

      {/* Locked last reading — cannot be edited by the driver */}
      <div className="rounded-2xl bg-ink-50 border border-ink-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-ink-400" />
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Last recorded reading
          </span>
        </div>
        <span className="font-plate font-bold tabular text-ink-700">
          {currentOdometer.toLocaleString()} km
        </span>
      </div>

      <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-4 w-4 text-orange-600" />
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
            Current odometer (km) *
          </Label>
        </div>
        <Input
          name="start_odometer_km"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={currentOdometer}
          className="h-14 text-2xl font-plate font-bold tabular text-center bg-white"
          required
        />
        <p className="text-xs text-orange-700/80 mt-2 text-center font-medium">
          Enter the reading shown on the dashboard right now.
        </p>
      </div>

      {/* Mandatory odometer photo — tamper-proof evidence */}
      <div className="rounded-2xl bg-white border border-ink-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="h-4 w-4 text-ink-500" />
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-600">
            Photo of odometer *
          </Label>
        </div>
        {photoUrl ? (
          <div className="relative rounded-xl overflow-hidden ring-1 ring-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Odometer" className="w-full max-h-56 object-cover" />
            <label className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-ink-950/70 backdrop-blur text-white flex items-center justify-center cursor-pointer">
              <X className="h-4 w-4" />
              <input
                type="file"
                name="start_odometer_photo"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                className="sr-only"
                required
              />
            </label>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 hover:border-orange-300 hover:bg-orange-50/40 py-8 cursor-pointer transition-all">
            <Camera className="h-6 w-6 text-ink-400" />
            <span className="text-xs uppercase tracking-wider text-ink-400 font-bold">
              Tap to capture
            </span>
            <input
              type="file"
              name="start_odometer_photo"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="sr-only"
              required
            />
          </label>
        )}
        <p className="text-[10px] text-ink-400 mt-2">
          Required. A manager is alerted if the reading looks tampered with.
        </p>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        <Play className="h-5 w-5" />
        {isPending ? "Starting…" : "Start trip"}
      </button>
    </form>
  );
}
