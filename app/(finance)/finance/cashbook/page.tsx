import { Wallet, ArrowDownLeft, ArrowUpRight, Landmark, PiggyBank } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCashbook, resolvePeriod, monthLabel } from "@/lib/finance/reports";
import { fmtMoney, fmtMoneyC } from "@/lib/finance/accounts";
import { PeriodFilter } from "@/components/finance/PeriodFilter";
import { CashflowChart } from "@/components/finance/FinanceCharts";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default async function CashbookPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const supabase = await createClient();
  const cb = await getCashbook(supabase, period);

  // Monthly cash-flow series (receipts vs payments) grouped by YYYY-MM.
  const byMonth = new Map<string, { label: string; receipts: number; payments: number }>();
  for (const r of cb.rows) {
    const ym = r.date.slice(0, 7);
    let m = byMonth.get(ym);
    if (!m) { m = { label: monthLabel(ym), receipts: 0, payments: 0 }; byMonth.set(ym, m); }
    if (r.type === "receipt") m.receipts += r.amount; else m.payments += r.amount;
  }
  const monthly = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);

  // Running balance in row order.
  let running = cb.opening;
  const rows = cb.rows.map((r) => {
    running += r.type === "receipt" ? r.amount : -r.amount;
    return { ...r, balance: running };
  });

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
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Cashbook</h1>
            <p className="mt-2 text-sm text-slate-300">{period.label}</p>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2"><PeriodFilter /></div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Wallet} tone="sky" label="Opening Balance" value={fmtMoneyC(cb.opening)} hint="Brought forward" />
        <Kpi icon={ArrowDownLeft} tone="emerald" label="Receipts" value={fmtMoney(cb.totalReceipts)} hint="Cash in this period" />
        <Kpi icon={ArrowUpRight} tone="rose" label="Payments" value={fmtMoney(cb.totalPayments)} hint="Cash out this period" />
        <Kpi icon={Landmark} tone="brand" label="Closing Balance" value={fmtMoneyC(cb.closing)} hint="Carried forward" />
      </section>

      {/* Cash flow chart */}
      <section className="rounded-2xl bg-white border border-ink-200/70 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink-900">Cash Flow</h2>
          <p className="text-xs text-ink-500 mt-0.5">Receipts vs payments by month</p>
        </div>
        <CashflowChart data={monthly} />
      </section>

      {/* Ledger */}
      <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-left">Category</th>
                <th className="px-5 py-3 text-right">Receipt</th>
                <th className="px-5 py-3 text-right">Payment</th>
                <th className="px-5 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-500">No cash movements in this period.</td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3 whitespace-nowrap text-ink-500">{fmtDate(r.date)}</td>
                    <td className="px-5 py-3 text-ink-700">{r.description}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">{r.category}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-plate text-emerald-600">{r.type === "receipt" ? fmtMoney(r.amount) : "—"}</td>
                    <td className="px-5 py-3 text-right font-plate text-rose-600">{r.type === "payment" ? fmtMoney(r.amount) : "—"}</td>
                    <td className="px-5 py-3 text-right font-plate text-ink-900">{fmtMoneyC(r.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
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
