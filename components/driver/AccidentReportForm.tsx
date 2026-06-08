"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertOctagon, Send, MapPin } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { reportAccident } from "@/actions/accidents";
import { PhotoInput } from "@/components/primitives/PhotoInput";
import type { CountryCode } from "@/types/domain";

interface VehicleOpt {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
}

interface AccidentReportFormProps {
  vehicle: VehicleOpt;
  activeTripId: string | null;
}

const SEVERITIES = [
  { value: "minor", label: "Minor", desc: "Scrape / no injuries", color: "sky" },
  { value: "moderate", label: "Moderate", desc: "Damaged but driveable", color: "amber" },
  { value: "severe", label: "Severe", desc: "Major damage / hospitalised", color: "rose" },
  { value: "fatal", label: "Fatal", desc: "Fatality involved", color: "crimson" },
] as const;

const colorMap = {
  sky: { ring: "ring-sky-300", bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700" },
  amber: { ring: "ring-amber-300", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  rose: { ring: "ring-rose-300", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700" },
  crimson: { ring: "ring-rose-400", bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800" },
};

export function AccidentReportForm({ vehicle, activeTripId }: AccidentReportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [severity, setSeverity] = useState<"minor" | "moderate" | "severe" | "fatal">("moderate");
  const [otherParties, setOtherParties] = useState(false);
  const [injuries, setInjuries] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("photos");
    fd.set("vehicle_id", vehicle.id);
    if (activeTripId) fd.set("trip_id", activeTripId);
    fd.set("severity", severity);
    fd.set("other_parties_involved", otherParties ? "true" : "false");
    fd.set("injuries", injuries ? "true" : "false");
    // Attach the compressed scene photos (kept small client-side).
    photoFiles.forEach((f) => fd.append("photos", f));

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
        const result = await reportAccident(fd);
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          toast.success("Accident reported. Fleet team has been notified.");
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  const inputCls =
    "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500/40";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Severity */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Severity <span className="text-rose-500">*</span>
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
                  active ? `${c.bg} ${c.border} ring-2 ${c.ring}` : "bg-white border-ink-200 hover:border-ink-300"
                }`}
              >
                <p className={`text-sm font-bold ${active ? c.text : "text-ink-900"}`}>{s.label}</p>
                <p className="text-[10px] text-ink-500 mt-0.5 leading-tight">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* When / where */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            When did it happen? <span className="text-rose-500">*</span>
          </Label>
          <Input
            name="occurred_at"
            type="datetime-local"
            defaultValue={new Date().toISOString().slice(0, 16)}
            className={inputCls}
            required
          />
        </div>
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
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Where <span className="text-rose-500">*</span>
        </Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <Input
            name="location_description"
            placeholder="A1 north of Bulawayo, ~5km from Gwanda turn-off"
            className={inputCls + " pl-10"}
            required
          />
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          What happened? <span className="text-rose-500">*</span>
        </Label>
        <textarea
          name="description"
          rows={4}
          placeholder="Describe the sequence of events"
          className={inputCls + " py-3 resize-none h-auto min-h-[112px]"}
          required
        />
      </div>

      {/* Conditions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Weather</Label>
          <Input name="weather" placeholder="Clear / Rain / Fog" className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Road</Label>
          <Input name="road_conditions" placeholder="Dry / Wet / Gravel" className={inputCls} />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3 rounded-2xl bg-ink-50 p-4">
        <ToggleRow
          label="Other vehicles or people involved?"
          checked={otherParties}
          onChange={setOtherParties}
        />
        {otherParties && (
          <textarea
            name="third_party_details"
            rows={3}
            placeholder="Names, phone numbers, plates, insurer…"
            className={inputCls + " py-3 resize-none h-auto min-h-[88px]"}
          />
        )}
        <ToggleRow label="Were there any injuries?" checked={injuries} onChange={setInjuries} />
        {injuries && (
          <textarea
            name="injuries_details"
            rows={3}
            placeholder="Who was injured, where they were taken"
            className={inputCls + " py-3 resize-none h-auto min-h-[88px]"}
          />
        )}
      </div>

      {/* Police */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Police case #
          </Label>
          <Input name="police_report_number" placeholder="If filed" className={inputCls + " font-plate"} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Police station
          </Label>
          <Input name="police_station" placeholder="Where it was filed" className={inputCls} />
        </div>
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Scene photos</Label>
        <PhotoInput name="photos" max={10} label="Add scene photos" onFilesChange={setPhotoFiles} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-rose-500/30 transition-all disabled:opacity-50"
      >
        <Send className="h-5 w-5" />
        {isPending ? "Reporting…" : "Submit accident report"}
      </button>

      <p className="text-[11px] text-ink-500 flex items-start gap-1.5">
        <AlertOctagon className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
        Submitting raises an immediate critical alert for the fleet management team.
      </p>
    </form>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-ink-700 font-medium">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          checked ? "bg-rose-500" : "bg-ink-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white transition-transform shadow-md ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
