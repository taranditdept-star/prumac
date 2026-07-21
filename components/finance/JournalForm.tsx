"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, Scale } from "lucide-react";
import { createJournalEntry } from "@/actions/finance";
import { fmtMoney } from "@/lib/finance/accounts";

export interface AccountOpt {
  id: string;
  code: string;
  name: string;
}

interface LineState {
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
}

const field =
  "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-ink-500";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const num = (s: string) => Math.max(0, parseFloat(s) || 0);
const blankLine = (): LineState => ({ account_id: "", debit: "", credit: "", memo: "" });

export function JournalForm({ accounts }: { accounts: AccountOpt[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineState[]>([blankLine(), blankLine()]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + num(l.debit), 0);
    const credit = lines.reduce((s, l) => s + num(l.credit), 0);
    const filled = lines.filter((l) => l.account_id && (num(l.debit) > 0 || num(l.credit) > 0)).length;
    const diff = debit - credit;
    const balanced = Math.round(diff * 100) === 0;
    return { debit, credit, diff, balanced, filled };
  }, [lines]);

  const canSubmit = totals.balanced && totals.debit > 0 && totals.filled >= 2;

  function onDebit(i: number, v: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, debit: v, credit: num(v) > 0 ? "" : l.credit } : l)));
  }
  function onCredit(i: number, v: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, credit: v, debit: num(v) > 0 ? "" : l.debit } : l)));
  }
  function setField(i: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, blankLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function reset() {
    setDate(todayISO());
    setMemo("");
    setReference("");
    setLines([blankLine(), blankLine()]);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    const payload = lines
      .filter((l) => l.account_id && (num(l.debit) > 0 || num(l.credit) > 0))
      .map((l) => ({ account_id: l.account_id, debit: num(l.debit), credit: num(l.credit), memo: l.memo.trim() || null }));

    const fd = new FormData();
    fd.set("entry_date", date);
    fd.set("memo", memo.trim());
    fd.set("reference", reference.trim());
    fd.set("lines", JSON.stringify(payload));

    startTransition(async () => {
      const r = await createJournalEntry(fd);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Journal posted · ${fmtMoney(totals.debit, 2)}.`);
      reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-ink-200/70 p-5 lg:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] space-y-5">
      <p className="text-sm font-bold text-ink-900">New journal entry</p>

      {/* Header fields */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label}>Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} />
        </div>
        <div className="lg:col-span-2">
          <label className={label}>Memo</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Owner capital injection" className={field} />
        </div>
        <div>
          <label className={label}>Reference</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. JV-001" className={field} />
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
          <span className="col-span-5">Account</span>
          <span className="col-span-2 text-right">Debit</span>
          <span className="col-span-2 text-right">Credit</span>
          <span className="col-span-2">Memo</span>
          <span className="col-span-1" />
        </div>

        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <select
              value={l.account_id}
              onChange={(e) => setField(i, { account_id: e.target.value })}
              className={`${field} col-span-12 sm:col-span-5 cursor-pointer`}
              aria-label={`Line ${i + 1} account`}
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={l.debit} onChange={(e) => onDebit(i, e.target.value)}
              placeholder="0.00"
              className={`${field} col-span-5 sm:col-span-2 text-right font-plate`}
              aria-label={`Line ${i + 1} debit`}
            />
            <input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={l.credit} onChange={(e) => onCredit(i, e.target.value)}
              placeholder="0.00"
              className={`${field} col-span-5 sm:col-span-2 text-right font-plate`}
              aria-label={`Line ${i + 1} credit`}
            />
            <input
              value={l.memo} onChange={(e) => setField(i, { memo: e.target.value })}
              placeholder="Optional"
              className={`${field} col-span-10 sm:col-span-2`}
              aria-label={`Line ${i + 1} memo`}
            />
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 2}
              className="col-span-2 sm:col-span-1 inline-flex h-11 items-center justify-center rounded-xl border border-ink-200 text-ink-400 hover:border-rose-300 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:border-ink-200 disabled:hover:text-ink-400"
              aria-label={`Remove line ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addLine}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-dashed border-ink-300 text-xs font-semibold text-ink-600 hover:border-orange-300 hover:text-orange-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </div>

      {/* Totals footer */}
      <div className="rounded-xl bg-ink-50 border border-ink-200/70 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Total Debits</p>
            <p className="text-lg font-bold text-ink-900 font-plate tabular">{fmtMoney(totals.debit, 2)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Total Credits</p>
            <p className="text-lg font-bold text-ink-900 font-plate tabular">{fmtMoney(totals.credit, 2)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Difference</p>
            <p className={`text-lg font-bold font-plate tabular ${totals.balanced ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtMoney(Math.abs(totals.diff), 2)}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${totals.balanced && totals.debit > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <Scale className="h-3.5 w-3.5" />
          {totals.debit === 0 ? "Enter amounts" : totals.balanced ? "Balanced" : "Out of balance"}
        </span>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Posting…" : "Post journal"}
        </button>
      </div>
    </form>
  );
}
