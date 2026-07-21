import { NotebookPen, BookOpen } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAccounts } from "@/lib/finance/reports";
import { fmtMoney } from "@/lib/finance/accounts";
import { JournalForm } from "@/components/finance/JournalForm";
import { DeleteJournalButton } from "@/components/finance/DeleteJournalButton";

export const dynamic = "force-dynamic";

interface EntryRow {
  id: string;
  entry_date: string;
  memo: string | null;
  reference: string | null;
  journal_lines: { debit: number; credit: number; memo: string | null; chart_of_accounts: { code: string; name: string } | null }[];
}

export default async function JournalPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [accounts, { data: entries }] = await Promise.all([
    fetchAccounts(supabase),
    supabase
      .schema("app")
      .from("journal_entries")
      .select("id, entry_date, memo, reference, journal_lines(debit, credit, memo, chart_of_accounts(code, name))")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<EntryRow[]>(),
  ]);

  const list = entries ?? [];
  const accOpts = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <section className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7 lg:px-9 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10 text-[11px] font-semibold text-white uppercase tracking-[0.14em]">
            <NotebookPen className="h-3.5 w-3.5" /> Setup
          </span>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">General Journal</h1>
          <p className="mt-2 text-sm text-slate-300 max-w-xl">Post capital, loans, bank balances, opening balances and adjustments. Every entry must balance — debits equal credits.</p>
        </div>
      </section>

      <JournalForm accounts={accOpts} />

      <section>
        <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">Recent entries ({list.length})</p>
        {list.length === 0 ? (
          <div className="rounded-2xl bg-white border border-ink-200/70 py-14 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2"><BookOpen className="h-6 w-6 text-ink-400" /></div>
            <p className="text-sm font-semibold text-ink-900">No journal entries yet</p>
            <p className="text-xs text-ink-500 mt-1">Post your first entry above to record something the operations data doesn&rsquo;t capture.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((e) => {
              const total = e.journal_lines.reduce((s, l) => s + Number(l.debit), 0);
              return (
                <div key={e.id} className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ink-100 bg-ink-50/40">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900 truncate">{e.memo || "Journal entry"}</p>
                      <p className="text-xs text-ink-500">
                        {new Date(`${e.entry_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                        {e.reference && <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 font-plate text-[10px] text-ink-500">{e.reference}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-plate text-sm font-bold text-ink-900">{fmtMoney(total, 2)}</span>
                      <DeleteJournalButton id={e.id} />
                    </div>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {e.journal_lines.map((l, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-ink-700">
                          <span className="font-plate text-ink-400 mr-2">{l.chart_of_accounts?.code}</span>
                          {l.chart_of_accounts?.name}
                          {l.memo && <span className="text-ink-400"> · {l.memo}</span>}
                        </span>
                        <span className="w-28 text-right font-plate text-ink-800">{Number(l.debit) > 0 ? fmtMoney(Number(l.debit), 2) : ""}</span>
                        <span className="w-28 text-right font-plate text-ink-800">{Number(l.credit) > 0 ? fmtMoney(Number(l.credit), 2) : ""}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">
                      <span className="flex-1" />
                      <span className="w-28 text-right">Debit</span>
                      <span className="w-28 text-right">Credit</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
