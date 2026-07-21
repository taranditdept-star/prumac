import { ListTree, Wallet, Scale, PiggyBank, TrendingUp, TrendingDown } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAccounts } from "@/lib/finance/reports";
import { TYPE_LABEL, type Account, type AccountType } from "@/lib/finance/accounts";
import { AccountForm } from "@/components/finance/AccountForm";

export const dynamic = "force-dynamic";

const ORDER: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
const META: Record<AccountType, { icon: React.ComponentType<{ className?: string }>; tone: keyof typeof TONES }> = {
  asset: { icon: Wallet, tone: "sky" },
  liability: { icon: Scale, tone: "amber" },
  equity: { icon: PiggyBank, tone: "violet" },
  income: { icon: TrendingUp, tone: "emerald" },
  expense: { icon: TrendingDown, tone: "rose" },
};

const TONES: Record<string, { bg: string; text: string; ring: string }> = {
  sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
  violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
};

export default async function ChartOfAccountsPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();
  const accounts = await fetchAccounts(supabase);
  const byType = (t: AccountType) => accounts.filter((a) => a.type === t);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <section className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7 lg:px-9 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10 text-[11px] font-semibold text-white uppercase tracking-[0.14em]">
              <ListTree className="h-3.5 w-3.5" /> Setup
            </span>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Chart of Accounts</h1>
            <p className="mt-2 text-sm text-slate-300">The accounts your financial statements are built on.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {ORDER.map((t) => {
          const m = META[t]; const tn = TONES[m.tone];
          return (
            <div key={t} className="rounded-2xl bg-white border border-ink-200/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className={`h-10 w-10 rounded-xl ${tn.bg} ${tn.text} ring-1 ${tn.ring} flex items-center justify-center mb-3`}><m.icon className="h-5 w-5" /></div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{TYPE_LABEL[t]}</p>
              <p className="text-2xl font-bold text-ink-900 tabular font-plate mt-1">{byType(t).length}</p>
              <p className="text-[11px] text-ink-500 mt-1">accounts</p>
            </div>
          );
        })}
      </section>

      <div className="flex justify-end"><AccountForm /></div>

      {ORDER.map((t) => {
        const rows = byType(t);
        if (rows.length === 0) return null;
        return (
          <section key={t} className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${TONES[META[t].tone].text.replace("text-", "bg-")}`} />
              <h2 className="text-sm font-bold text-ink-900">{TYPE_LABEL[t]}</h2>
              <span className="text-xs text-ink-400">· {rows.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-5 py-3 text-left">Code</th>
                    <th className="px-5 py-3 text-left">Account name</th>
                    <th className="px-5 py-3 text-left">Normal balance</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((a: Account) => (
                    <tr key={a.id} className={`hover:bg-ink-50/40 transition-colors ${!a.is_active ? "opacity-50" : ""}`}>
                      <td className="px-5 py-3 font-plate font-semibold text-ink-700">{a.code}</td>
                      <td className="px-5 py-3">
                        <span className="text-ink-900 font-medium">{a.name}</span>
                        {a.is_system && <span className="ml-2 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">System</span>}
                        {a.subtype && <span className="ml-2 text-[11px] text-ink-400">{a.subtype.replace(/_/g, " ")}</span>}
                      </td>
                      <td className="px-5 py-3 capitalize text-ink-600">{a.normal_balance}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.is_active ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"}`}>
                          {a.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
