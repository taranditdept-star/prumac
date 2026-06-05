"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Send } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { reportFault } from "@/actions/faults";
import { PhotoInput } from "@/components/primitives/PhotoInput";
import { FAULT_CATEGORIES } from "@/lib/validation/fault";
import type { CountryCode } from "@/types/domain";

interface VehicleOpt {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
}

interface FaultReportFormProps {
  vehicle: VehicleOpt;
  activeTripId: string | null;
}

const SEVERITIES = [
  { value: "low", label: "Low", desc: "Cosmetic / minor inconvenience", color: "sky" },
  { value: "medium", label: "Medium", desc: "Functional but degraded", color: "amber" },
  { value: "high", label: "High", desc: "Needs urgent attention", color: "orange" },
  { value: "critical", label: "Critical", desc: "Unsafe to drive", color: "rose" },
] as const;

const colorMap = {
  sky: { ring: "ring-sky-300", bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700" },
  amber: { ring: "ring-amber-300", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  orange: { ring: "ring-orange-300", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  rose: { ring: "ring-rose-300", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700" },
};

export function FaultReportForm({ vehicle, activeTripId }: FaultReportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicle.id);
    if (activeTripId) fd.set("trip_id", activeTripId);
    fd.set("severity", severity);

    // Capture location if available
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fd.set("lat", String(pos.coords.latitude));
          fd.set("lng", String(pos.coords.longitude));
          submit(fd);
        },
        () => submit(fd),
        { timeout: 3000 },
      );
    } else {
      submit(fd);
    }
  }

  function submit(fd: FormData) {
    startTransition(async () => {
      try {
        const result = await reportFault(fd);
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          toast.success("Fault reported");
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  const inputCls =
    "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Severity picker */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Severity <span className="text-orange-500">*</span>
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => {
            const c = colorMap[s.color];
            const active = severity === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`text-left rounded-xl border-2 p-3 transition-all ${
                  active
                    ? `${c.bg} ${c.border} ring-2 ${c.ring}`
                    : "bg-white border-ink-200 hover:border-ink-300"
                }`}
              >
                <p className={`text-sm font-bold ${active ? c.text : "text-ink-900"}`}>{s.label}</p>
                <p className="text-[10px] text-ink-500 mt-0.5 leading-tight">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Category <span className="text-orange-500">*</span>
        </Label>
        <select name="category" defaultValue="engine" className={selectCls} required>
          {FAULT_CATEGORIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Short title <span className="text-orange-500">*</span>
        </Label>
        <Input name="title" placeholder="e.g. Brakes squealing on left front" className={inputCls} required />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Description <span className="text-orange-500">*</span>
        </Label>
        <textarea
          name="description"
          rows={4}
          placeholder="When did it start? What does it feel/sound like? Any warning lights?"
          className={inputCls + " py-3 resize-none h-auto min-h-[112px]"}
          required
        />
      </div>

      {/* Odometer */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Odometer (km)
        </Label>
        <Input
          name="odometer_km"
          type="number"
          min={0}
          defaultValue={vehicle.current_odometer_km}
          className={inputCls + " font-plate"}
        />
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Photos
        </Label>
        <PhotoInput name="photos" max={6} label="Add fault photos" />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        <Send className="h-5 w-5" />
        {isPending ? "Reporting…" : "Submit fault report"}
      </button>

      <p className="text-[11px] text-ink-500 flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        High or critical faults raise an immediate alert for the fleet manager.
      </p>
    </form>
  );
}
