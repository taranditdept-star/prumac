"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Truck, Search, Gauge, User, Check, Save, ArrowRight } from "lucide-react";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { logMileage } from "@/actions/mileage";
import type { CountryCode } from "@/types/domain";

export interface VehicleOpt {
  id: string;
  plate: string;
  country: CountryCode;
  make: string;
  model: string;
  odometer: number;
  driver: string | null;
}

const PURPOSES = [
  ["delivery", "Delivery"],
  ["sales", "Sales"],
  ["collection", "Collection"],
  ["maintenance_run", "Maintenance run"],
  ["admin", "Admin"],
  ["personal", "Personal"],
  ["other", "Other"],
] as const;

const field =
  "h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-ink-500";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MileageLogForm({ vehicles }: { vehicles: VehicleOpt[] }) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState("");
  const [purpose, setPurpose] = useState("delivery");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [logged, setLogged] = useState<{ plate: string; start: number; end: number; km: number }[]>([]);
  const endRef = useRef<HTMLInputElement>(null);

  const selected = vehicles.find((v) => v.id === vehicleId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? vehicles.filter((v) => `${v.plate} ${v.make} ${v.model}`.toLowerCase().includes(q))
      : vehicles;
    return list.slice(0, 60);
  }, [query, vehicles]);

  function pick(v: VehicleOpt) {
    setVehicleId(v.id);
    setQuery("");
    setOpen(false);
    setStart(String(v.odometer ?? 0));
    setTimeout(() => endRef.current?.focus(), 50);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) {
      toast.error("Pick a vehicle first.");
      return;
    }
    const fd = new FormData();
    fd.set("vehicle_id", selected.id);
    fd.set("occurred_on", date);
    fd.set("origin_label", origin);
    fd.set("destination_label", destination);
    fd.set("route_description", route);
    fd.set("purpose", purpose);
    fd.set("start_odometer_km", start);
    fd.set("end_odometer_km", end);

    startTransition(async () => {
      const r = await logMileage(fd);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      const km = Number(end) - Number(start);
      toast.success(`Saved · ${km.toLocaleString()} km. Odometer now ${r.endOdometer.toLocaleString()}.`);
      setLogged((prev) => [{ plate: selected.plate, start: Number(start), end: Number(end), km }, ...prev].slice(0, 20));
      // Prep the next entry: same vehicle, start = the reading we just ended on.
      setStart(String(r.endOdometer));
      setEnd("");
      setOrigin("");
      setDestination("");
      setRoute("");
      setTimeout(() => endRef.current?.focus(), 50);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form onSubmit={submit} className="space-y-5 lg:col-span-2">
        {/* Vehicle picker */}
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <Truck className="h-4 w-4 text-orange-500" /> Vehicle
          </p>
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <PlateBadge plate={selected.plate} country={selected.country} size="sm" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">{selected.make} {selected.model}</p>
                  <p className="text-xs text-ink-500 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {selected.driver ?? "No driver assigned"}</span>
                    <span className="inline-flex items-center gap-1 font-plate"><Gauge className="h-3 w-3" /> {selected.odometer.toLocaleString()} km</span>
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => { setVehicleId(null); setStart(""); }} className="text-xs font-semibold text-ink-500 hover:text-ink-900">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  placeholder="Search plate, make or model…"
                  className={`${field} pl-10`}
                />
              </div>
              {open && (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-xl">
                  {filtered.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-ink-500">No vehicles match.</li>
                  ) : (
                    filtered.map((v) => (
                      <li key={v.id}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-orange-50/60">
                          <PlateBadge plate={v.plate} country={v.country} size="sm" />
                          <span className="flex-1 text-sm text-ink-800">{v.make} {v.model}</span>
                          <span className="font-plate text-xs text-ink-400">{v.odometer.toLocaleString()} km</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Trip details */}
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
            </div>
            <div>
              <label className={label}>Purpose</label>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={field}>
                {PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>From (origin)</label>
              <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Harare CBD" className={field} />
            </div>
            <div>
              <label className={label}>To (destination)</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Sherwood Farm" className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Reason / route (optional)</label>
            <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Redcliff – Sherwood delivery" className={field} />
          </div>
        </div>

        {/* Mileage */}
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Start mileage (km) *</label>
              <input type="number" inputMode="numeric" min={0} value={start} onChange={(e) => setStart(e.target.value)} required className={`${field} font-plate`} placeholder="auto-filled from last reading" />
            </div>
            <div>
              <label className={label}>End mileage (km) *</label>
              <input ref={endRef} type="number" inputMode="numeric" min={0} value={end} onChange={(e) => setEnd(e.target.value)} required className={`${field} font-plate`} />
            </div>
          </div>
          {start && end && Number(end) >= Number(start) && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Distance: {(Number(end) - Number(start)).toLocaleString()} km
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending || !selected}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 text-base font-bold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
        >
          <Save className="h-5 w-5" />
          {isPending ? "Saving…" : "Save & log next"}
        </button>
      </form>

      {/* Session log */}
      <aside className="space-y-3">
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <p className="text-sm font-bold text-ink-900">Logged this session</p>
          <p className="mt-0.5 text-xs text-ink-500">{logged.length} record{logged.length === 1 ? "" : "s"} saved</p>
          {logged.length === 0 ? (
            <p className="mt-4 text-xs text-ink-400 italic">Saved entries appear here. The next entry auto-fills the start from the last reading.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {logged.map((l, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-plate font-semibold text-ink-800">{l.plate}</span>
                  <span className="font-plate text-ink-500">{l.start.toLocaleString()}</span>
                  <ArrowRight className="h-3 w-3 text-ink-400" />
                  <span className="font-plate text-ink-500">{l.end.toLocaleString()}</span>
                  <span className="ml-auto font-plate font-bold text-orange-600">{l.km.toLocaleString()} km</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
