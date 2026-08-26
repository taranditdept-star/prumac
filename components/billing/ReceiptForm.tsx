"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Receipt, ArrowRight } from "lucide-react";
import { recordReceipt } from "@/actions/receipts";

export interface OpenInvoice {
  id: string;
  invoice_number: string;
  due_at: string | null;
  balance_outstanding: number;
  currency: string | null;
}
export interface CustomerOption {
  id: string;
  name: string;
  outstanding: number;
  invoices: OpenInvoice[];
}

const money = (n: number, ccy = "USD") =>
  `${ccy} ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/**
 * Shows exactly which invoices a receipt will settle BEFORE it is saved.
 * Allocation is oldest-first, and this preview runs the same arithmetic the
 * server does — nobody should have to trust a number that moves $1.35m of
 * receivables without seeing where it lands.
 */
export function ReceiptForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const customer = customers.find((c) => c.id === subsidiaryId);

  const preview = useMemo(() => {
    const value = Number(amount);
    if (!customer || !Number.isFinite(value) || value <= 0) return null;
    const cents = (n: number) => Math.round(n * 100);
    let remaining = cents(value);
    const rows: { invoice: OpenInvoice; amount: number; settles: boolean }[] = [];
    for (const inv of customer.invoices) {
      if (remaining <= 0) break;
      const owed = cents(Number(inv.balance_outstanding));
      if (owed <= 0) continue;
      const take = Math.min(owed, remaining);
      rows.push({ invoice: inv, amount: take / 100, settles: take === owed });
      remaining -= take;
    }
    return { rows, unapplied: remaining / 100 };
  }, [customer, amount]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await recordReceipt(fd);
      if ("error" in r) { toast.error(r.error); return; }
      const n = r.data?.allocated.length ?? 0;
      toast.success(
        `Receipt recorded — ${n} invoice${n === 1 ? "" : "s"} updated` +
          (r.data?.unapplied ? `, ${money(r.data.unapplied)} unapplied` : ""),
      );
      setAmount("");
      router.refresh();
    });
  }

  const field =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";
  const label = "block text-xs font-bold uppercase tracking-wide text-ink-500 mb-1.5";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Receipt className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-ink-900">Record a receipt</h2>
          <p className="text-xs text-ink-500">Settled against the oldest invoices first</p>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="subsidiary_id">Customer</label>
        <select
          id="subsidiary_id" name="subsidiary_id" required className={field}
          value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)}
        >
          <option value="">Choose a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {money(c.outstanding)} owing
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="amount">Amount received</label>
          <input
            id="amount" name="amount" type="number" step="0.01" min="0.01" inputMode="decimal"
            required value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00" className={`${field} font-plate`}
          />
        </div>
        <div>
          <label className={label} htmlFor="paid_at">Date received</label>
          <input
            id="paid_at" name="paid_at" type="date" required
            value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={field}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="method">How it was paid</label>
          <select id="method" name="method" className={field} defaultValue="bank_transfer">
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="ecocash">EcoCash</option>
            <option value="cheque">Cheque</option>
            <option value="offset">Contra / offset</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="reference">Reference</label>
          <input id="reference" name="reference" maxLength={80} placeholder="Deposit slip no." className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="notes">Note (optional)</label>
        <input id="notes" name="notes" maxLength={500} className={field} />
      </div>

      {/* Where the money is about to land. */}
      {preview && (
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">
            This will settle
          </p>
          {preview.rows.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing owing to allocate against.</p>
          ) : (
            <ul className="space-y-1.5">
              {preview.rows.map(({ invoice, amount: amt, settles }) => (
                <li key={invoice.id} className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                  <span className="font-plate text-ink-900">{invoice.invoice_number}</span>
                  <span className="text-xs text-ink-400">due {day(invoice.due_at)}</span>
                  <span className="ml-auto font-semibold text-ink-900">{money(amt)}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      settles ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {settles ? "PAID" : "PART"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.unapplied > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
              {money(preview.unapplied)} more than is owed — check this against the deposit slip
              before saving.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !subsidiaryId || !amount}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
        {isPending ? "Recording…" : "Record receipt"}
      </button>
    </form>
  );
}
