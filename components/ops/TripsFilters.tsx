"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, X, SlidersHorizontal, FileSpreadsheet } from "lucide-react";

interface VehicleOpt {
  id: string;
  plate_number: string;
  make: string;
  model: string;
}

interface Props {
  vehicles: VehicleOpt[];
  months: string[]; // 'YYYY-MM', ascending
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export function TripsFilters({ vehicles, months }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => { setQ(sp.get("q") ?? ""); }, [sp]);

  const years = Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort();
  const period = sp.get("period") ?? "all";
  const vehicle = sp.get("vehicle") ?? "all";
  const status = sp.get("status") ?? "all";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const hasCustom = from !== "" || to !== "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    // Picking a named period clears any custom range, and vice-versa — they're
    // two ways of choosing the same window, so only one can be active.
    if (key === "period" && value !== "all") { params.delete("from"); params.delete("to"); }
    if ((key === "from" || key === "to") && value) params.delete("period");
    router.replace(`/trips?${params.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam("q", q.trim());
  }

  const hasFilters =
    period !== "all" || vehicle !== "all" || status !== "all" || (sp.get("q") ?? "") !== "" || hasCustom;

  // The export mirrors exactly what's on screen — same query string, different route.
  const exportHref = `/trips/export${sp.toString() ? `?${sp.toString()}` : ""}`;

  const selectCls =
    "h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 cursor-pointer";
  const dateCls =
    "h-10 rounded-xl border border-ink-200 bg-white px-2.5 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 cursor-pointer";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <form onSubmit={submitSearch} className="relative flex-1 min-w-56 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search route…"
            className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </form>

        <div className="inline-flex items-center gap-1.5 text-ink-400">
          <SlidersHorizontal className="h-4 w-4" />
        </div>

        {/* Period */}
        <select value={hasCustom ? "all" : period} onChange={(e) => setParam("period", e.target.value)} className={selectCls} aria-label="Period">
          <option value="all">All time</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
          <option disabled>──────</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>

        {/* Vehicle */}
        <select value={vehicle} onChange={(e) => setParam("vehicle", e.target.value)} className={selectCls} aria-label="Vehicle">
          <option value="all">All vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.plate_number} · {v.make} {v.model}</option>
          ))}
        </select>

        {/* Status */}
        <select value={status} onChange={(e) => setParam("status", e.target.value)} className={selectCls} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="in_progress">In progress</option>
          <option value="paused">Paused</option>
          <option value="ended">Awaiting completion</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <a
          href={exportHref}
          className="h-10 px-3.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export to Excel
        </a>

        {hasFilters && (
          <button
            type="button"
            onClick={() => router.replace("/trips")}
            className="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-600 hover:bg-ink-50 inline-flex items-center gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Custom date range */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Custom range</span>
        <input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} className={dateCls} aria-label="From date" />
        <span className="text-ink-400">→</span>
        <input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} className={dateCls} aria-label="To date" />
        {hasCustom && (
          <button
            type="button"
            onClick={() => { const p = new URLSearchParams(sp.toString()); p.delete("from"); p.delete("to"); router.replace(`/trips?${p.toString()}`); }}
            className="text-xs font-medium text-ink-500 hover:text-ink-900 underline"
          >
            clear range
          </button>
        )}
      </div>
    </div>
  );
}
