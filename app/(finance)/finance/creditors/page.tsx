import Link from "next/link";
import { Banknote, ListChecks, ArrowUpRight, PiggyBank } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCreditors, resolvePeriod } from "@/lib/finance/reports";
import { fmtMoney } from "@/lib/finance/accounts";
import { PeriodFilter } from "@/components/finance/PeriodFilter";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

export default async function CreditorsPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const supabase = await createClient();
  const c = await getCreditors(supabase, period.end);

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
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Creditors (Payables)</h1>
            <p className="mt-2 text-sm text-slate-300">{period.label}</p>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2"><PeriodFilter asAt /></div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Banknote} tone="amber" label="Total Payables" value={fmtMoney(c.total)} hint="Owed to suppliers & lenders" />
        <Kpi icon={ListChecks} tone="sky" label="Open Items" value={String(c.rows.length)} hint="Outstanding entries" />
      </section>

      {/* Ledger */}
      {c.rows.length === 0 ? (
        <section className="rounded-2xl bg-white border border-ink-200/70 p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 flex items-center justify-center shrink-0"><Banknote className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink-900">No creditors recorded</h2>
              <p className="mt-1 text-sm text-ink-500 max-w-2xl">
                Creditors (payables) are recorded through the General Journal by posting a credit to <span className="font-medium text-ink-700">Accounts Payable (2000)</span>. Once you post supplier bills, accruals or loans, the open balances will appear here.
              </p>
              <Link href="/finance/journal" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800 transition-colors">
                Post a Journal <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                  <th className="px-5 py-3 text-left">Creditor / Memo</th>
                  <th className="px-5 py-3 text-left">Reference</th>
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {c.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3 text-ink-700">{r.name}</td>
                    <td className="px-5 py-3 text-ink-500">{r.reference ?? "—"}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-ink-500">{fmtDate(r.date)}</td>
                    <td className="px-5 py-3 text-right font-plate text-ink-900">{fmtMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 bg-ink-50/50 font-semibold text-ink-900">
                  <td className="px-5 py-3 text-left" colSpan={3}>Total Payables</td>
                  <td className="px-5 py-3 text-right font-plate">{fmtMoney(c.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
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
