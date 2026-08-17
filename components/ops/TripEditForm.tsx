"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { updateTrip } from "@/actions/trips";

const PURPOSES: [string, string][] = [
  ["delivery", "Delivery"],
  ["sales", "Sales"],
  ["collection", "Collection"],
  ["maintenance_run", "Maintenance run"],
  ["admin", "Admin"],
  ["personal", "Personal"],
  ["other", "Other"],
];

interface TripEditFormProps {
  tripId: string;
  purpose: string;
  routeDescription: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  fuelLitres: number | null;
  fuelAmount: number | null;
  loadCount: number | null;
}

export function TripEditForm(props: TripEditFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [purpose, setPurpose] = useState(props.purpose);
  const [route, setRoute] = useState(props.routeDescription ?? "");
  const [origin, setOrigin] = useState(props.originLabel ?? "");
  const [destination, setDestination] = useState(props.destinationLabel ?? "");
  const [startOdo, setStartOdo] = useState(props.startOdometer != null ? String(props.startOdometer) : "");
  const [endOdo, setEndOdo] = useState(props.endOdometer != null ? String(props.endOdometer) : "");
  const [fuelL, setFuelL] = useState(props.fuelLitres != null ? String(props.fuelLitres) : "");
  const [fuelA, setFuelA] = useState(props.fuelAmount != null ? String(props.fuelAmount) : "");
  const [loads, setLoads] = useState(props.loadCount != null ? String(props.loadCount) : "");

  function submit() {
    if (!startOdo.trim()) {
      toast.error("Start odometer is required.");
      return;
    }
    const fd = new FormData();
    fd.set("trip_id", props.tripId);
    fd.set("purpose", purpose);
    fd.set("route_description", route);
    fd.set("origin_label", origin);
    fd.set("destination_label", destination);
    fd.set("start_odometer_km", startOdo);
    fd.set("end_odometer_km", endOdo);
    fd.set("fuel_litres", fuelL);
    fd.set("fuel_amount", fuelA);
    fd.set("load_count", loads);
    startTransition(async () => {
      const res = await updateTrip(fd);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success("Trip updated");
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 hover:border-orange-300 hover:text-orange-700 transition-colors"
      >
        <Pencil className="h-4 w-4" /> Edit trip details
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink-900">Edit trip details</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Field label="Purpose">
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        >
          {PURPOSES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>

      <Field label="Route description">
        <TextInput value={route} onChange={setRoute} placeholder="e.g. Harare depot → Bulawayo" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origin"><TextInput value={origin} onChange={setOrigin} /></Field>
        <Field label="Destination"><TextInput value={destination} onChange={setDestination} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start odometer (km)"><NumInput value={startOdo} onChange={setStartOdo} /></Field>
        <Field label="End odometer (km)"><NumInput value={endOdo} onChange={setEndOdo} placeholder="—" /></Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Fuel (L)"><NumInput value={fuelL} onChange={setFuelL} placeholder="—" /></Field>
        <Field label="Fuel amount"><NumInput value={fuelA} onChange={setFuelA} placeholder="—" /></Field>
        <Field label="Loads"><NumInput value={loads} onChange={setLoads} placeholder="—" /></Field>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-600 hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
    />
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm font-plate focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
    />
  );
}
