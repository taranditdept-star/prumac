import { Receipt, TrendingDown, AlertTriangle, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ReceiptForm, type CustomerOption, type OpenInvoice } from "@/components/billing/ReceiptForm";

export const dynamic = "force-dynamic";

interface InvoiceRow extends OpenInvoice {
  subsidiary_id: string;
  status: string;
  subsidiaries: { name: string } | null;
}
interface PaymentRow {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  invoices: { invoice_number: string; subsidiaries: { name: string } | null } | null;
}

const money = (n: number) =>
  `USD ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function ReceiptsPage() {
  await requireRole("admin", "fleet_manager");
  const supabase = await createClient();

  const [{ data: open }, { data: payments }] = await Promise.all([
    supabase.schema("app").from("invoices")
      .select("id, invoice_number, due_at, balance_outstanding, currency, subsidiary_id, status, subsidiaries(name)")
      .in("status", ["issued", "overdue"])
      .gt("balance_outstanding", 0)
      .order("due_at", { ascending: true, nullsFirst: false })
      .returns<InvoiceRow[]>(),
    supabase.schema("app").from("invoice_payments")
      .select("id, amount, paid_at, method, reference, invoices(invoice_number, subsidiaries(name))")
      .order("paid_at", { ascending: false })
      .limit(15)
      .returns<PaymentRow[]>(),
  ]);

  // Group what is owed by customer — a receipt is settled against the customer,
  // not against one invoice, because that is how the money actually arrives.
  const byCustomer = new Map<string, CustomerOption>();
  for (const inv of open ?? []) {
    const existing = byCustomer.get(inv.subsidiary_id) ?? {
      id: inv.subsidiary_id,
      name: inv.subsidiaries?.name ?? "Unknown customer",
      outstanding: 0,
      invoices: [],
    };
    existing.outstanding += Number(inv.balance_outstanding);
    existing.invoices.push({
      id: inv.id, invoice_number: inv.invoice_number, due_at: inv.due_at,
      balance_outstanding: Number(inv.balance_outstanding), currency: inv.currency,
    });
    byCustomer.set(inv.subsidiary_id, existing);
  }
  const customers = [...byCustomer.values()].sort((a, b) => b.outstanding - a.outstanding);

  const today = new Date().toISOString().slice(0, 10);
  const totalOutstanding = customers.reduce((t, c) => t + c.outstanding, 0);
  const overdueValue = (open ?? [])
    .filter((i) => i.due_at && i.due_at < today)
    .reduce((t, i) => t + Number(i.balance_outstanding), 0);
  const oldest = (open ?? []).find((i) => i.due_at)?.due_at ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <header>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-ink-900">Receipts</h1>
        <p className="mt-1 text-sm text-ink-500">
          Record money received and settle it against what a customer owes
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={TrendingDown} tone="rose" label="Outstanding" value={money(totalOutstanding)}
          hint={`${customers.length} customer${customers.length === 1 ? "" : "s"} owing`} />
        <Kpi icon={AlertTriangle} tone="amber" label="Past due" value={money(overdueValue)}
          hint="Already past the due date" />
        <Kpi icon={Clock} tone="sky" label="Oldest unpaid" value={day(oldest)}
          hint="Due date of the oldest open invoice" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <ReceiptForm customers={customers} />

        <section className="rounded-2xl border border-ink-200/70 bg-white overflow-hidden">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-sm font-bold text-ink-900">Recent receipts</h2>
            <p className="text-xs text-ink-500">The last 15 recorded</p>
          </div>
          {(payments ?? []).length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
                <Receipt className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-ink-900">No receipts recorded yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-ink-500">
                Every invoice raised is still showing as unpaid. Record what has come in and the
                debtors figures start telling the truth.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1 basis-[55%]">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {p.invoices?.subsidiaries?.name ?? "—"}
                    </p>
                    <p className="text-xs text-ink-500">
                      <span className="font-plate">{p.invoices?.invoice_number ?? "—"}</span>
                      {p.method ? ` · ${p.method.replaceAll("_", " ")}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{money(Number(p.amount))}</span>
                  <span className="text-xs text-ink-400">{day(p.paid_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, tone, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "rose" | "amber" | "sky";
  label: string; value: string; hint: string;
}) {
  const tones = {
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
  } as const;
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-4">
      <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-900">{value}</p>
      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
    </div>
  );
}
