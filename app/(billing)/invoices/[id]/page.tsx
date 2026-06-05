import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Calendar, FileText, DollarSign, AlertCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InvoiceStatusBadge } from "@/components/primitives/InvoiceStatusBadge";
import { InvoiceActions } from "@/components/billing/InvoiceActions";

export const dynamic = "force-dynamic";

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  status: string;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_at: string | null;
  currency: string;
  subtotal: number;
  maintenance_credit: number;
  previous_balance: number;
  total_due: number;
  amount_paid: number;
  balance_outstanding: number;
  voided_reason: string | null;
  voided_at: string | null;
  subsidiaries: { name: string; code: string; country: string } | null;
}

interface LineItem {
  id: string;
  line_type: string;
  description: string;
  quantity: number;
  unit_amount: number;
  line_amount: number;
}

interface Payment {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
}

function money(n: number, currency = "USD"): string {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("subsidiary_billing", "fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }] = await Promise.all([
    supabase
      .schema("app")
      .from("invoices")
      .select(`
        *,
        subsidiaries(name, code, country)
      `)
      .eq("id", id)
      .maybeSingle<InvoiceDetail>(),
    supabase
      .schema("app")
      .from("invoice_line_items")
      .select("id, line_type, description, quantity, unit_amount, line_amount")
      .eq("invoice_id", id)
      .order("sort_order")
      .returns<LineItem[]>(),
    supabase
      .schema("app")
      .from("invoice_payments")
      .select("id, amount, paid_at, method, reference")
      .eq("invoice_id", id)
      .order("paid_at", { ascending: false })
      .returns<Payment[]>(),
  ]);

  if (!invoice) notFound();

  const lineItems = lines ?? [];
  const tripLines = lineItems.filter((l) => l.line_type === "trip" || l.line_type === "fixed_fee");
  const maintenanceLines = lineItems.filter((l) => l.line_type === "maintenance_credit");
  const balanceLines = lineItems.filter((l) => l.line_type === "previous_balance" || l.line_type === "adjustment");

  const canIssue = profile.role === "admin";
  const canVoid = profile.role === "admin";
  const canPay = profile.role === "admin";

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <InvoiceStatusBadge status={invoice.status} />
              {invoice.due_at && (
                <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
                  Due {fmtDate(invoice.due_at)}
                </span>
              )}
            </div>
            <p className="font-plate text-lg font-bold text-orange-400 mb-1">
              {invoice.invoice_number}
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              {invoice.subsidiaries?.name ?? "Subsidiary"}
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {new Date(invoice.period_start).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </span>
              {invoice.subsidiaries?.country && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  {invoice.subsidiaries.country}
                </span>
              )}
            </div>
          </div>

          {/* Headline total */}
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 px-6 py-4 text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
              Total due
            </p>
            <p className="font-plate text-3xl lg:text-4xl font-bold text-white tabular mt-1">
              {money(invoice.total_due, invoice.currency)}
            </p>
            {Number(invoice.amount_paid) > 0 && (
              <p className="text-xs text-emerald-400 mt-1">
                {money(invoice.amount_paid, invoice.currency)} paid
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Void notice */}
      {invoice.voided_reason && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-rose-800">
              Voided {invoice.voided_at && fmtDate(invoice.voided_at)}
            </p>
            <p className="text-xs text-rose-700 mt-0.5">{invoice.voided_reason}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line items + payments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Charges */}
          <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
            <div className="px-5 py-3 border-b border-ink-100 bg-ink-50/50">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500 font-bold">
                Trip charges & fees
              </p>
            </div>
            {tripLines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500 italic">
                No billable trips in this period
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {tripLines.map((l) => (
                    <LineRow key={l.id} line={l} currency={invoice.currency} />
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Maintenance credits */}
          {maintenanceLines.length > 0 && (
            <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
              <div className="px-5 py-3 border-b border-ink-100 bg-emerald-50/40">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-bold">
                  Maintenance credits
                </p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {maintenanceLines.map((l) => (
                    <LineRow key={l.id} line={l} currency={invoice.currency} credit />
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Carry-forward balance */}
          {balanceLines.length > 0 && (
            <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
              <div className="px-5 py-3 border-b border-ink-100 bg-amber-50/40">
                <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-bold">
                  Previous balance
                </p>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-ink-100">
                  {balanceLines.map((l) => (
                    <LineRow key={l.id} line={l} currency={invoice.currency} />
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Totals */}
          <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
            <h2 className="text-base font-bold text-ink-900 mb-4">Summary</h2>
            <div className="space-y-2.5 text-sm">
              <Row label="Subtotal (charges)" value={money(invoice.subtotal, invoice.currency)} />
              {Number(invoice.maintenance_credit) > 0 && (
                <Row
                  label="Less maintenance credit"
                  value={`− ${money(invoice.maintenance_credit, invoice.currency)}`}
                  emerald
                />
              )}
              {Number(invoice.previous_balance) > 0 && (
                <Row
                  label="Brought forward"
                  value={money(invoice.previous_balance, invoice.currency)}
                />
              )}
              <div className="pt-3 mt-3 border-t border-ink-200 flex items-center justify-between">
                <span className="text-base font-bold text-ink-900">Total due</span>
                <span className="text-xl font-bold font-plate text-ink-900 tabular">
                  {money(invoice.total_due, invoice.currency)}
                </span>
              </div>
              {Number(invoice.amount_paid) > 0 && (
                <>
                  <Row label="Amount paid" value={money(invoice.amount_paid, invoice.currency)} emerald />
                  <div className="pt-3 mt-3 border-t border-ink-200 flex items-center justify-between">
                    <span className="text-base font-bold text-ink-900">Outstanding</span>
                    <span
                      className={`text-xl font-bold font-plate tabular ${
                        Number(invoice.balance_outstanding) > 0 ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {money(invoice.balance_outstanding, invoice.currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Payments */}
          {(payments ?? []).length > 0 && (
            <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-bold text-ink-900">Payments</h2>
              </div>
              <div className="space-y-2">
                {(payments ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-emerald-50/50 border border-emerald-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-emerald-900 font-plate">
                        {money(p.amount, invoice.currency)}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        {p.method ?? "Payment"} · {fmtDate(p.paid_at)}
                        {p.reference && <span className="font-plate"> · {p.reference}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Actions sidebar */}
        <aside className="space-y-4">
          <InvoiceActions
            invoiceId={id}
            status={invoice.status}
            totalDue={Number(invoice.total_due)}
            amountPaid={Number(invoice.amount_paid)}
            canIssue={canIssue}
            canVoid={canVoid}
            canPay={canPay}
          />

          <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-bold text-ink-900">Invoice details</p>
            </div>
            <Field label="Number" value={invoice.invoice_number} mono />
            <Field
              label="Period"
              value={`${fmtDate(invoice.period_start)} → ${fmtDate(invoice.period_end)}`}
            />
            <Field label="Issued" value={invoice.issued_at ? fmtDate(invoice.issued_at) : "—"} />
            <Field label="Due" value={invoice.due_at ? fmtDate(invoice.due_at) : "—"} />
            <Field label="Currency" value={invoice.currency} mono />
          </div>
        </aside>
      </div>
    </div>
  );
}

function LineRow({
  line, currency, credit,
}: {
  line: LineItem;
  currency: string;
  credit?: boolean;
}) {
  return (
    <tr>
      <td className="px-5 py-3 align-top">
        <p className="text-sm font-medium text-ink-900">{line.description}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">
          {Number(line.quantity).toLocaleString()} × {currency} {Number(line.unit_amount).toFixed(4)}
        </p>
      </td>
      <td className="px-5 py-3 align-top text-right">
        <p className={`text-sm font-bold font-plate tabular ${credit ? "text-emerald-700" : "text-ink-900"}`}>
          {credit ? "− " : ""}
          {money(Math.abs(Number(line.line_amount)), currency)}
        </p>
      </td>
    </tr>
  );
}

function Row({ label, value, emerald }: { label: string; value: string; emerald?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-600">{label}</span>
      <span className={`font-plate tabular font-semibold ${emerald ? "text-emerald-700" : "text-ink-900"}`}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className={`text-sm font-semibold text-ink-900 mt-0.5 ${mono ? "font-plate" : ""}`}>{value}</p>
    </div>
  );
}
