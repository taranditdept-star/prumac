import Link from "next/link";
import { ArrowLeft, Trophy, ShieldCheck, Clock, AlertOctagon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RatingBadge } from "@/components/primitives/RatingBadge";
import type { DriverScorecardRow } from "@/types/domain";

export const dynamic = "force-dynamic";

function initials(name: string | null): string {
  if (!name) return "D";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ScorecardsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data } = await supabase.schema("app").rpc("fn_driver_scorecards").returns<DriverScorecardRow[]>();
  const rows = Array.isArray(data) ? data : [];

  const avg = rows.length > 0 ? rows.reduce((s, r) => s + Number(r.overall_score), 0) / rows.length : 0;
  const totalAccidents = rows.reduce((s, r) => s + r.accident_count, 0);
  const atRisk = rows.filter((r) => r.rating === "poor" || r.rating === "fair").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to drivers
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-6">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl shadow-emerald-500/30">
              <Trophy className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Driver scorecards</h1>
              <p className="text-sm text-slate-300 mt-1">Safety &amp; performance ranking across active drivers</p>
            </div>
          </div>
          <div className="flex gap-3">
            <HeroStat icon={ShieldCheck} label="Fleet avg" value={avg.toFixed(0)} />
            <HeroStat icon={AlertOctagon} label="Accidents" value={totalAccidents.toString()} />
            <HeroStat icon={Clock} label="Needs attention" value={atRisk.toString()} />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <p className="text-sm font-semibold text-ink-900">No active drivers to score</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left w-12">#</th>
                <th className="px-6 py-3 text-left">Driver</th>
                <th className="px-6 py-3 text-left">Rating</th>
                <th className="px-6 py-3 text-right">Trips</th>
                <th className="px-6 py-3 text-right">Km</th>
                <th className="px-6 py-3 text-right">Punctual</th>
                <th className="px-6 py-3 text-right">Accidents</th>
                <th className="px-6 py-3 text-right">Safety</th>
                <th className="px-6 py-3 text-right">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r, i) => (
                <tr key={r.driver_id} className="hover:bg-ink-50/40 transition-colors">
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                        i === 0
                          ? "bg-amber-100 text-amber-700"
                          : i === 1
                            ? "bg-ink-100 text-ink-600"
                            : i === 2
                              ? "bg-orange-100 text-orange-700"
                              : "text-ink-400"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/drivers/${r.driver_id}`} className="flex items-center gap-3 group">
                      <span className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shrink-0">
                        {initials(r.full_name)}
                      </span>
                      <span className="font-medium text-ink-900 group-hover:text-orange-600 transition-colors">
                        {r.full_name ?? "Driver"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <RatingBadge rating={r.rating} />
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">{r.trips_completed}</td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">
                    {Math.round(Number(r.total_km)).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">
                    {Number(r.punctuality_pct).toFixed(0)}%
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs">
                    <span className={r.accident_count > 0 ? "text-rose-600 font-bold" : "text-ink-400"}>
                      {r.accident_count}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs text-ink-700">
                    {Math.round(Number(r.safety_score))}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-plate text-sm font-bold text-ink-900">
                      {Number(r.overall_score).toFixed(0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 px-5 py-3 text-center">
      <Icon className="h-4 w-4 text-slate-300 mx-auto mb-1" />
      <p className="text-xl font-bold text-white font-plate tabular">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">{label}</p>
    </div>
  );
}
