"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, XCircle, DollarSign, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { issueInvoice, voidInvoice, recordPayment } from "@/actions/billing";

interface InvoiceActionsProps {
  invoiceId: string;
  status: string;
  totalDue: number;
  amountPaid: number;
  canIssue: boolean;
  canVoid: boolean;
  canPay: boolean;
}

export function InvoiceActions({
  invoiceId, status, totalDue, amountPaid,
  canIssue, canVoid, canPay,
}: InvoiceActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showVoid, setShowVoid] = useState(false);
  const [showPay, setShowPay] = useState(false);

  function call(fn: () => Promise<unknown>) {
    startTransition(async () => {
      const r = (await fn()) as { error?: string };
      if (r?.error) toast.error(r.error);
      else {
        toast.success("Done");
        setShowVoid(false);
        setShowPay(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-2">
        Actions
      </p>

      {/* Download PDF — always available */}
      <a
        href={`/invoices/${invoiceId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-11 rounded-xl bg-ink-900 hover:bg-ink-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
      >
        <Download className="h-4 w-4" />
        Download PDF
      </a>

      {canIssue && status === "draft" && (
        <button
          type="button"
          onClick={() => call(() => issueInvoice(invoiceId))}
          disabled={isPending}
          className="w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-orange-500/30 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          Issue invoice
        </button>
      )}

      {canPay && (status === "issued" || status === "partially_paid" || status === "overdue") && !showPay && (
        <button
          type="button"
          onClick={() => setShowPay(true)}
          className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/30 transition-colors"
        >
          <DollarSign className="h-4 w-4" />
          Record payment
        </button>
      )}

      {canVoid && status !== "void" && status !== "paid" && !showVoid && (
        <button
          type="button"
          onClick={() => setShowVoid(true)}
          className="w-full h-9 rounded-xl bg-white border border-ink-200 hover:border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <XCircle className="h-3.5 w-3.5" />
          Void invoice
        </button>
      )}

      {showVoid && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("invoice_id", invoiceId);
            call(() => voidInvoice(fd));
          }}
          className="mt-3 pt-3 border-t border-ink-100 space-y-2"
        >
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Void reason *
          </Label>
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="e.g. Billing error — regenerating"
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-9 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              Confirm void
            </button>
            <button
              type="button"
              onClick={() => setShowVoid(false)}
              className="px-3 text-xs text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showPay && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("invoice_id", invoiceId);
            call(() => recordPayment(fd));
          }}
          className="mt-3 pt-3 border-t border-ink-100 space-y-2"
        >
          <div>
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Amount (USD) *
            </Label>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={(totalDue - amountPaid).toFixed(2)}
              defaultValue={(totalDue - amountPaid).toFixed(2)}
              required
              className="mt-1 font-plate"
            />
          </div>
          <div>
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Paid on *
            </Label>
            <Input
              name="paid_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className="mt-1 font-plate"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                Method
              </Label>
              <Input name="method" placeholder="Bank transfer" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                Reference
              </Label>
              <Input name="reference" placeholder="TXN ref" className="mt-1 font-plate" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              Confirm payment
            </button>
            <button
              type="button"
              onClick={() => setShowPay(false)}
              className="px-3 text-xs text-ink-500 hover:text-ink-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
