"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertOctagon, Send, MapPin } from "lucide-react";
import { reportAccident } from "@/actions/accidents";
import { PhotoInput } from "@/components/primitives/PhotoInput";
import { FormSection, FieldLabel, fieldClass, textareaClass, SubmitButton } from "@/components/driver/FormKit";
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
  { value: "minor", label: "Minor", desc: "Scrape · no injuries", color: "sky" },
  { value: "moderate", label: "Moderate", desc: "Damaged but driveable", color: "amber" },
  { value: "severe", label: "Severe", desc: "Major damage · hospitalised", color: "rose" },
  { value: "fatal", label: "Fatal", desc: "Fatality involved", color: "crimson" },
] as const;

const colorMap = {
  sky: { bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-700" },
  amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
  rose: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-700" },
  crimson: { bg: "bg-rose-100", border: "border-rose-400", text: "text-rose-800" },
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
    photoFiles.forEach((f) => fd.append("photos", f));

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); submit(fd); },
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
          sessionStorage.removeItem("accident-photos");
          toast.success("Accident reported. Fleet team has been notified.");
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) toast.error(err.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1 · Severity */}
      <FormSection step={1} title="How serious is it?">
        <div className="grid grid-cols-2 gap-2.5">
          {SEVERITIES.map((s) => {
            const c = colorMap[s.color];
            const active = severity === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeverity(s.value)}
                className={`text-left rounded-2xl border-2 p-3 transition-all active:scale-[0.98] ${
                  active ? `${c.bg} ${c.border}` : "bg-white border-ink-200"
                }`}
              >
                <p className={`text-sm font-bold ${active ? c.text : "text-ink-900"}`}>{s.label}</p>
                <p className="text-[10px] text-ink-500 mt-0.5 leading-tight">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </FormSection>

      {/* 2 · When & where */}
      <FormSection step={2} title="When & where">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>When</FieldLabel>
            <input name="occurred_at" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} className={fieldClass} required />
          </div>
          <div>
            <FieldLabel>Odometer</FieldLabel>
            <input name="odometer_km" type="number" min={0} defaultValue={vehicle.current_odometer_km} className={`${fieldClass} font-plate`} />
          </div>
        </div>
        <div>
          <FieldLabel required>Where did it happen?</FieldLabel>
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input name="location_description" placeholder="A1 north of Bulawayo, ~5km from Gwanda turn-off" className={`${fieldClass} pl-10`} required />
          </div>
        </div>
      </FormSection>

      {/* 3 · Conditions & people */}
      <FormSection step={3} title="Conditions & people involved">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Weather</FieldLabel>
            <input name="weather" placeholder="Clear / Rain" className={fieldClass} />
          </div>
          <div>
            <FieldLabel>Road</FieldLabel>
            <input name="road_conditions" placeholder="Dry / Wet" className={fieldClass} />
          </div>
        </div>
        <div className="space-y-3 rounded-2xl bg-ink-50 p-3.5">
          <ToggleRow label="Other vehicles or people involved?" checked={otherParties} onChange={setOtherParties} />
          {otherParties && (
            <textarea name="third_party_details" rows={3} placeholder="Names, phone numbers, plates, insurer…" className={textareaClass} />
          )}
          <ToggleRow label="Were there any injuries?" checked={injuries} onChange={setInjuries} />
          {injuries && (
            <textarea name="injuries_details" rows={3} placeholder="Who was injured, where they were taken" className={textareaClass} />
          )}
        </div>
      </FormSection>

      {/* 4 · Statement & police */}
      <FormSection step={4} title="Your statement">
        <div>
          <FieldLabel required>What happened?</FieldLabel>
          <textarea name="description" rows={4} placeholder="Describe the sequence of events" className={textareaClass} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Police case #</FieldLabel>
            <input name="police_report_number" placeholder="If filed" className={`${fieldClass} font-plate`} />
          </div>
          <div>
            <FieldLabel>Police station</FieldLabel>
            <input name="police_station" placeholder="If filed" className={fieldClass} />
          </div>
        </div>
      </FormSection>

      {/* 5 · Photos */}
      <FormSection step={5} title="Scene photos" hint="Photograph the damage and scene from a few angles.">
        <PhotoInput name="photos" max={10} label="scene" onFilesChange={setPhotoFiles} persistKey="accident-photos" />
      </FormSection>

      <SubmitButton tone="rose" disabled={isPending} icon={<Send className="h-5 w-5" />}>
        {isPending ? "Reporting…" : "Submit accident report"}
      </SubmitButton>

      <p className="text-[11px] text-ink-500 flex items-start gap-1.5 px-1">
        <AlertOctagon className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
        Submitting raises an immediate critical alert for the fleet management team.
      </p>
    </form>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-ink-700 font-medium">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${checked ? "bg-rose-500" : "bg-ink-300"}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform shadow-md ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </label>
  );
}
