"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Period picker driving `?year=` or `?from=YYYY-MM&to=YYYY-MM` in the URL.
 * Presets cover the fiscal years present in the data plus a custom range.
 */
export function PeriodFilter({ years = [2025, 2026], asAt = false }: { years?: number[]; asAt?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const year = sp.get("year") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const custom = from !== "" || to !== "";

  const push = (params: URLSearchParams) => router.replace(`${pathname}?${params.toString()}`);
  const setYear = (y: string) => { const p = new URLSearchParams(); if (y) p.set("year", y); push(p); };
  const setRange = (k: "from" | "to", v: string) => {
    const p = new URLSearchParams(sp.toString()); p.delete("year");
    if (v) p.set(k, v); else p.delete(k); push(p);
  };

  const monthOpts: string[] = [];
  for (const y of years) for (let m = 1; m <= 12; m++) monthOpts.push(`${y}-${String(m).padStart(2, "0")}`);

  const sel = "h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 cursor-pointer";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-ink-400 text-xs font-semibold uppercase tracking-wider"><CalendarRange className="h-4 w-4" /> {asAt ? "As at" : "Period"}</span>
      {!asAt && (
        <select value={custom ? "" : year} onChange={(e) => setYear(e.target.value)} className={sel} aria-label="Year">
          <option value="">Last 12 months</option>
          {years.map((y) => <option key={y} value={y}>FY {y}</option>)}
        </select>
      )}
      <select value={from} onChange={(e) => setRange("from", e.target.value)} className={sel} aria-label="From month">
        <option value="">{asAt ? "Latest" : "From…"}</option>
        {monthOpts.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
      </select>
      <span className="text-ink-400">→</span>
      <select value={to} onChange={(e) => setRange("to", e.target.value)} className={sel} aria-label="To month">
        <option value="">{asAt ? "Latest" : "To…"}</option>
        {monthOpts.map((m) => <option key={m} value={m}>{MONTHS[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
      </select>
      {(custom || year) && (
        <button type="button" onClick={() => push(new URLSearchParams())} className="h-10 px-3 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-600 hover:bg-ink-50">Reset</button>
      )}
    </div>
  );
}
