"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Gauge, Camera, Lock, X, ShieldCheck, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startTrip } from "@/actions/trips";
import { SinglePhotoInput } from "@/components/primitives/SinglePhotoInput";

interface DriverStartTripFormProps {
  vehicleId: string;
  driverId: string;
  subsidiaries: { id: string; name: string }[];
  defaultSubsidiaryId: string | null;
  currentOdometer: number;
  agreement: { id: string; title: string; body_md: string } | null;
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
  agreement,
}: DriverStartTripFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!photoFile) {
      toast.error("Take a photo of the odometer to start the trip.");
      return;
    }
    if (agreement && !accepted) {
      toast.error("Please accept the vehicle-use terms to continue.");
      setShowTerms(true);
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicleId);
    fd.set("driver_id", driverId);
    fd.set("terms_accepted", accepted ? "true" : "false");
    fd.set("start_odometer_photo", photoFile); // compressed image
    startTransition(async () => {
      try {
        const result = await startTrip(fd);
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          sessionStorage.removeItem("odometer-photo");
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
      <div className="rounded-2xl bg-white border border-ink-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-ink-500" />
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-600">
            Photo of odometer *
          </Label>
        </div>
        <SinglePhotoInput onFileChange={setPhotoFile} label="odometer" persistKey="odometer-photo" cameraOnly />
        <p className="text-[10px] text-ink-400">
          Required. A manager is alerted if the reading looks tampered with.
        </p>
      </div>

      {/* Vehicle-use terms — must be accepted before starting */}
      {agreement && (
        <div className="rounded-2xl bg-ink-50 border border-ink-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-ink-500" />
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-600">
              Vehicle-use terms
            </Label>
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-orange-600 focus:ring-orange-500/30"
            />
            <span className="text-sm text-ink-700 leading-snug">
              I have read and accept the{" "}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="font-bold text-orange-600 underline underline-offset-2"
              >
                {agreement.title}
              </button>
              .
            </span>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || (!!agreement && !accepted)}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Play className="h-5 w-5" />
        {isPending ? "Starting…" : "Start trip"}
      </button>

      {/* Terms modal */}
      {agreement && showTerms && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-950/60 backdrop-blur-sm p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 bg-white border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-orange-600 shrink-0" />
                <p className="text-sm font-bold text-ink-900 truncate">{agreement.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="h-8 w-8 rounded-lg bg-ink-100 hover:bg-ink-200 flex items-center justify-center shrink-0"
              >
                <X className="h-4 w-4 text-ink-600" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
              {agreement.body_md}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-ink-100 p-4">
              <button
                type="button"
                onClick={() => {
                  setAccepted(true);
                  setShowTerms(false);
                }}
                className="w-full h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold inline-flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-5 w-5" />
                I accept these terms
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
