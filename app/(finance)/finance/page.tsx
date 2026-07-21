import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet, Users, Banknote, Truck, ArrowUpRight, Scale, BookOpen, PiggyBank } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getOverview, resolvePeriod } from "@/lib/finance/reports";
import { fmtMoney } from "@/lib/finance/accounts";
import { PeriodFilter } from "@/components/finance/PeriodFilter";
import { ProfitTrendChart, ExpenseDonut } from "@/components/finance/FinanceCharts";

export const dynamic = "force-dynamic";

export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const supabase = await createClient();
  const o = await getOverview(supabase, period);

  const profitPositive = o.netProfit >= 0;

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
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Financial Overview</h1>
            <p className="mt-2 text-sm text-slate-300">{period.label}</p>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2"><PeriodFilter /></div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={TrendingUp} tone="emerald" label="Income" value={fmtMoney(o.revenue)} hint="Trip & other revenue" />
        <Kpi icon={TrendingDown} tone="rose" label="Expenses" value={fmtMoney(o.expenses)} hint="Fuel, maintenance & more" />
        <Kpi icon={profitPositive ? TrendingUp : TrendingDown} tone={profitPositive ? "brand" : "rose"} label="Net Profit" value={fmtMoney(o.netProfit)} hint={`${o.margin.toFixed(1)}% margin`} />
        <Kpi icon={Users} tone="amber" label="Receivables" value={fmtMoney(o.receivables)} hint={`${fmtMoney(o.overdue)} overdue`} />
      </section>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Wallet} tone="sky" label="Cash Received" value={fmtMoney(o.cashReceipts)} hint="Payments in this period" />
        <Kpi icon={Truck} tone="violet" label="Fleet Book Value" value={fmtMoney(o.fleetNbv)} hint="Net of depreciation" />
        <Kpi icon={Banknote} tone="emerald" label="Gross Margin" value={`${o.margin.toFixed(1)}%`} hint="Profit ÷ income" />
        <Kpi icon={Users} tone="rose" label="Overdue" value={fmtMoney(o.overdue)} hint="Past due from debtors" />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Income vs Expenses</h2>
              <p className="text-xs text-ink-500 mt-0.5">Monthly performance with net profit line</p>
            </div>
            <Link href="/finance/pnl" className="text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">Full P&amp;L <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          <ProfitTrendChart data={o.trend} />
        </div>
        <div className="rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="text-base font-semibold text-ink-900 mb-4">Expense Breakdown</h2>
          <ExpenseDonut data={o.expenseBreakdown} />
        </div>
      </section>

      {/* Top debtors + quick links */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="flex items-center justify-between p-6 pb-3">
            <h2 className="text-base font-semibold text-ink-900">Top Debtors</h2>
            <Link href="/finance/debtors" className="text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">View all <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
          {o.topDebtors.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-ink-500">No outstanding balances.</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {o.topDebtors.map((d, i) => {
                const max = o.topDebtors[0].amount || 1;
                return (
                  <div key={d.name} className="flex items-center gap-4 px-6 py-3">
                    <span className="h-8 w-8 rounded-lg bg-ink-100 text-ink-500 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{d.name}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-ink-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${(d.amount / max) * 100}%` }} /></div>
                    </div>
                    <span className="font-plate text-sm font-semibold text-ink-900 shrink-0">{fmtMoney(d.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <QuickLink href="/finance/balance-sheet" icon={Scale} tone="sky" title="Balance Sheet" desc="Assets, liabilities & equity" />
          <QuickLink href="/finance/cashbook" icon={BookOpen} tone="emerald" title="Cashbook" desc="Receipts & payments ledger" />
          <QuickLink href="/finance/journal" icon={Banknote} tone="violet" title="Post a Journal" desc="Record capital, loans, adjustments" />
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

function QuickLink({ href, icon: Icon, tone, title, desc }: { href: string; icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES; title: string; desc: string }) {
  const t = TONES[tone];
  return (
    <Link href={href} className="group rounded-2xl bg-white border border-ink-200/70 p-5 hover:border-orange-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all flex items-center gap-4">
      <div className={`h-11 w-11 rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring} flex items-center justify-center shrink-0`}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-ink-900">{title}</p><p className="text-[11px] text-ink-500 mt-0.5">{desc}</p></div>
      <ArrowUpRight className="h-4 w-4 text-ink-300 group-hover:text-orange-500 transition-colors shrink-0" />
    </Link>
  );
}
