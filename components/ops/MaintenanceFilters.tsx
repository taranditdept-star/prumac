"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X, SlidersHorizontal } from "lucide-react";

interface VehicleOpt {
  id: string;
  plate_number: string;
  make: string;
  model: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function MaintenanceFilters({ vehicles, months }: { vehicles: VehicleOpt[]; months: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const years = Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort();
  const period = sp.get("period") ?? "all";
  const vehicle = sp.get("vehicle") ?? "all";
  const type = sp.get("type") ?? "all";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    router.replace(`/maintenance?${params.toString()}`);
  }

  const hasFilters = period !== "all" || vehicle !== "all" || type !== "all";
  const selectCls =
    "h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 cursor-pointer";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="inline-flex items-center gap-1.5 text-ink-400">
        <SlidersHorizontal className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">Filter</span>
      </div>

      <select value={period} onChange={(e) => setParam("period", e.target.value)} className={selectCls} aria-label="Period">
        <option value="all">All time</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
        {months.length > 0 && <option disabled>──────</option>}
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>

      <select value={vehicle} onChange={(e) => setParam("vehicle", e.target.value)} className={selectCls} aria-label="Vehicle">
        <option value="all">All vehicles</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>{v.plate_number} · {v.make} {v.model}</option>
        ))}
      </select>

      <select value={type} onChange={(e) => setParam("type", e.target.value)} className={selectCls} aria-label="Type">
        <option value="all">All types</option>
        <option value="routine">Routine service</option>
        <option value="repair">Repair</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.replace("/maintenance")}
          className="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-600 hover:bg-ink-50 inline-flex items-center gap-1.5"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
