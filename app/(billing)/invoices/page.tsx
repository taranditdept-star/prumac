import Link from "next/link";
import { Plus, Receipt, ArrowUpRight, DollarSign, FileText, Clock, AlertOctagon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InvoiceStatusBadge } from "@/components/primitives/InvoiceStatusBadge";

export const dynamic = "force-dynamic";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_at: string | null;
  subtotal: number;
  total_due: number;
  amount_paid: number;
  balance_outstanding: number;
  currency: string;
  subsidiaries: { name: string; code: string } | null;
}

function fmtMoney(n: number, currency = "USD"): string {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start);
  return s.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default async function InvoicesPage() {
  const profile = await requireRole("subsidiary_billing", "fleet_manager", "admin");
  const supabase = await createClient();

  // subsidiary_billing only sees their own subsidiary's non-draft invoices
  // (RLS enforces this server-side; we still query through the user client)
  const { data: invoices, error } = await supabase
    .schema("app")
    .from("invoices")
    .select(`
      id, invoice_number, status, period_start, period_end, issued_at, due_at,
      subtotal, total_due, amount_paid, balance_outstanding, currency,
      subsidiaries(name, code)
    `)
    .order("period_start", { ascending: false })
    .limit(200)
    .returns<InvoiceRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load invoices: {error.message}
        </div>
      </div>
    );
  }

  const list = invoices ?? [];
  // Stats over the whole table (not just the displayed page).
  const { data: statRows } = await supabase
    .schema("app").from("invoices").select("status, balance_outstanding").limit(20000);
  const all = (statRows ?? []) as { status: string; balance_outstanding: number }[];
  const stats = {
    total: all.length,
    outstanding: all.reduce((s, i) => s + Number(i.balance_outstanding), 0),
    overdue: all.filter((i) => i.status === "overdue").length,
    draftCount: all.filter((i) => i.status === "draft").length,
  };

  const canGenerate = profile.role === "fleet_manager" || profile.role === "admin";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Invoices</h1>
          <p className="text-sm text-ink-500 mt-1">
            {profile.role === "subsidiary_billing"
              ? "Invoices issued for your subsidiary"
              : "Monthly billing per subsidiary"}
          </p>
        </div>
        {canGenerate && (
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Generate invoice
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Receipt} tone="brand" label="Total invoices" value={stats.total.toString()} />
        <Tile icon={DollarSign} tone="emerald" label="Outstanding" value={fmtMoney(stats.outstanding)} />
        <Tile icon={Clock} tone="amber" label="Drafts" value={stats.draftCount.toString()} />
        <Tile icon={AlertOctagon} tone="rose" label="Overdue" value={stats.overdue.toString()} />
      </div>

      {all.length > list.length && (
        <p className="text-xs text-ink-500">Showing the latest {list.length.toLocaleString()} of {all.length.toLocaleString()}.</p>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No invoices yet</p>
          {canGenerate && (
            <p className="text-xs text-ink-500 mt-1 mb-4">
              Generate your first invoice from a subsidiary&apos;s completed trips.
            </p>
          )}
          {canGenerate && (
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Generate invoice
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Invoice</th>
                <th className="px-6 py-3 text-left">Subsidiary</th>
                <th className="px-6 py-3 text-left">Period</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Total</th>
                <th className="px-6 py-3 text-right">Outstanding</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((inv) => (
                <tr key={inv.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${inv.id}`} className="block">
                      <p className="font-plate font-semibold text-ink-900 text-xs">{inv.invoice_number}</p>
                      {inv.issued_at && (
                        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold mt-0.5">
                          Issued {new Date(inv.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-ink-900 truncate max-w-[180px]">
                      {inv.subsidiaries?.name ?? "—"}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-ink-700">{fmtPeriod(inv.period_start, inv.period_end)}</td>
                  <td className="px-6 py-4">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-6 py-4 text-right font-plate text-xs font-bold text-ink-900">
                    {fmtMoney(inv.total_due, inv.currency)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-plate text-xs font-bold ${Number(inv.balance_outstanding) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {fmtMoney(inv.balance_outstanding, inv.currency)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex h-8 w-8 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "emerald" | "amber" | "rose";
  label: string;
  value: string;
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
  }[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
      <div className={`absolute top-0 right-0 h-20 w-20 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${t.text} tabular mt-2 font-plate`}>{value}</p>
    </div>
  );
}
