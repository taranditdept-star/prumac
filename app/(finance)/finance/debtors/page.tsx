import { Users, TrendingUp, Clock, AlertTriangle, PiggyBank } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDebtors, resolvePeriod } from "@/lib/finance/reports";
import { fmtMoney } from "@/lib/finance/accounts";
import { PeriodFilter } from "@/components/finance/PeriodFilter";
import { AgingBars } from "@/components/finance/FinanceCharts";

export const dynamic = "force-dynamic";

const cell = (n: number) => (n > 0 ? fmtMoney(n) : "—");

export default async function DebtorsPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const supabase = await createClient();
  const d = await getDebtors(supabase, period.end);

  const midBuckets = d.totals.d30 + d.totals.d60 + d.totals.d90;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Hero */}
      <section className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7 lg:px-9 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-24 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10 text-[11px] font-semibold text-white uppercase tracking-[0.14em]">
              <PiggyBank className="h-3.5 w-3.5" /> Finance
            </span>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Debtors &amp; Aging</h1>
            <p className="mt-2 text-sm text-slate-300">{period.label}</p>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2"><PeriodFilter asAt /></div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} tone="amber" label="Total Owed" value={fmtMoney(d.totals.total)} hint="Outstanding receivables" />
        <Kpi icon={TrendingUp} tone="emerald" label="Current" value={fmtMoney(d.totals.current)} hint="Not yet due" />
        <Kpi icon={Clock} tone="sky" label="31–90 days" value={fmtMoney(midBuckets)} hint="Past due, chase soon" />
        <Kpi icon={AlertTriangle} tone="rose" label="90+ days" value={fmtMoney(d.totals.d90plus)} hint="At-risk balances" />
      </section>

      {/* Aging chart */}
      <section className="rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink-900">Aging Summary</h2>
          <p className="text-xs text-ink-500 mt-0.5">Outstanding balances by age bucket</p>
        </div>
        <AgingBars
          data={[
            { bucket: "Current", amount: d.totals.current, color: "#10b981" },
            { bucket: "1–30", amount: d.totals.d30, color: "#0ea5e9" },
            { bucket: "31–60", amount: d.totals.d60, color: "#f59e0b" },
            { bucket: "61–90", amount: d.totals.d90, color: "#f97316" },
            { bucket: "90+", amount: d.totals.d90plus, color: "#ef4444" },
          ]}
        />
      </section>

      {/* Aging table */}
      <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-5 py-3 text-left">Subsidiary</th>
                <th className="px-5 py-3 text-right">Current</th>
                <th className="px-5 py-3 text-right">1–30</th>
                <th className="px-5 py-3 text-right">31–60</th>
                <th className="px-5 py-3 text-right">61–90</th>
                <th className="px-5 py-3 text-right">90+</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {d.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-ink-500">No outstanding balances.</td>
                </tr>
              ) : (
                d.rows.map((r) => (
                  <tr key={r.subsidiary_id} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink-900">{r.name}</p>
                      <p className="text-[11px] text-ink-400">{r.code}</p>
                    </td>
                    <td className="px-5 py-3 text-right font-plate text-ink-700">{cell(r.current)}</td>
                    <td className="px-5 py-3 text-right font-plate text-ink-700">{cell(r.d30)}</td>
                    <td className="px-5 py-3 text-right font-plate text-ink-700">{cell(r.d60)}</td>
                    <td className="px-5 py-3 text-right font-plate text-ink-700">{cell(r.d90)}</td>
                    <td className="px-5 py-3 text-right font-plate text-rose-600">{cell(r.d90plus)}</td>
                    <td className="px-5 py-3 text-right font-plate font-semibold text-ink-900">{fmtMoney(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {d.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50/50 font-semibold text-ink-900">
                  <td className="px-5 py-3 text-left">Total</td>
                  <td className="px-5 py-3 text-right font-plate">{cell(d.totals.current)}</td>
                  <td className="px-5 py-3 text-right font-plate">{cell(d.totals.d30)}</td>
                  <td className="px-5 py-3 text-right font-plate">{cell(d.totals.d60)}</td>
                  <td className="px-5 py-3 text-right font-plate">{cell(d.totals.d90)}</td>
                  <td className="px-5 py-3 text-right font-plate">{cell(d.totals.d90plus)}</td>
                  <td className="px-5 py-3 text-right font-plate">{fmtMoney(d.totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  brand: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
  sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
};

function Kpi({ icon: Icon, tone, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES | string; label: string; value: string; hint?: string }) {
  const t = TONES[tone] ?? TONES.brand;
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className={`h-10 w-10 rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring} flex items-center justify-center mb-3`}><Icon className="h-5 w-5" /></div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-2xl font-bold text-ink-900 tabular font-plate mt-1">{value}</p>
      {hint && <p className="text-[11px] text-ink-500 mt-1">{hint}</p>}
    </div>
  );
}
