import { Wallet, Landmark, Scale, CheckCircle2, AlertTriangle, PiggyBank } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getBalanceSheet, resolvePeriod, type BsLine } from "@/lib/finance/reports";
import { fmtMoney, fmtMoneyC } from "@/lib/finance/accounts";
import { PeriodFilter } from "@/components/finance/PeriodFilter";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ year?: string; from?: string; to?: string }> }) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const supabase = await createClient();
  const bs = await getBalanceSheet(supabase, period);

  // bs.asAt is an exclusive next-month date — subtract a day for the display label.
  const asAtDisplay = new Date(new Date(`${bs.asAt}T00:00:00Z`).getTime() - 86400000);
  const asAtLabel = asAtDisplay.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const diff = bs.totalAssets - bs.totalEquity;
  const balanced = Math.round(diff) === 0;

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
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Balance Sheet</h1>
            <p className="mt-2 text-sm text-slate-300">As at {asAtLabel}</p>
          </div>
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-2"><PeriodFilter asAt /></div>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Wallet} tone="sky" label="Total Assets" value={fmtMoney(bs.totalAssets)} hint="What the business owns" />
        <Kpi icon={Landmark} tone="amber" label="Total Liabilities" value={fmtMoney(bs.totalLiabilities)} hint="What the business owes" />
        <Kpi icon={Scale} tone="violet" label="Net Equity" value={fmtMoney(bs.totalEquity)} hint="Owner's stake" />
        {balanced ? (
          <Kpi icon={CheckCircle2} tone="emerald" label="Balance Check" value="In balance" hint="Assets = Liabilities + Equity" />
        ) : (
          <Kpi icon={AlertTriangle} tone="amber" label="Balance Check" value={fmtMoneyC(diff)} hint="Assets − Equity difference" />
        )}
      </section>

      {/* Statement columns */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Assets */}
        <div className="rounded-2xl bg-white border border-ink-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <SectionHeader>Assets</SectionHeader>
          <div className="divide-y divide-ink-100">
            {bs.assets.map((l) => <Line key={l.code} line={l} />)}
          </div>
          <TotalRow name="Total Assets" value={fmtMoneyC(bs.totalAssets)} strong />
        </div>

        {/* Liabilities + Equity */}
        <div className="rounded-2xl bg-white border border-ink-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <SectionHeader>Liabilities</SectionHeader>
          <div className="divide-y divide-ink-100">
            {bs.liabilities.map((l) => <Line key={l.code} line={l} />)}
          </div>
          <TotalRow name="Total Liabilities" value={fmtMoneyC(bs.totalLiabilities)} />

          <SectionHeader>Equity</SectionHeader>
          <div className="divide-y divide-ink-100">
            {bs.equity.map((l, i) => <Line key={`${l.code}-${i}`} line={l} />)}
          </div>
          <TotalRow name="Total Equity" value={fmtMoneyC(bs.totalEquity)} />

          <TotalRow name="Liabilities + Equity" value={fmtMoneyC(bs.totalLiabilities + bs.totalEquity)} strong />
        </div>
      </section>
    </div>
  );
}

function Line({ line }: { line: BsLine }) {
  return (
    <div className="flex items-center gap-3 px-6 py-2.5">
      <span className="font-plate text-xs text-ink-400 w-12 shrink-0">{line.code}</span>
      <span className="text-sm text-ink-700">{line.name}</span>
      <span className="flex-1 border-b border-dotted border-ink-200/70 mx-1" />
      <span className="font-plate tabular text-right text-sm font-medium text-ink-900">{fmtMoneyC(line.amount)}</span>
    </div>
  );
}

function TotalRow({ name, value, strong = false }: { name: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-6 border-t border-ink-100 ${strong ? "py-4 bg-ink-50/80 border-ink-200/70" : "py-3.5 bg-ink-50/60"}`}>
      <span className="w-12 shrink-0" />
      <span className={`text-sm font-bold text-ink-900 ${strong ? "uppercase tracking-[0.1em]" : ""}`}>{name}</span>
      <span className="flex-1" />
      <span className="font-plate tabular text-right text-sm font-bold text-ink-900">{value}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-2.5 bg-ink-50/70 border-y border-ink-100">
      <h3 className="text-[11px] uppercase tracking-[0.16em] font-bold text-ink-500">{children}</h3>
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
