import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Building, Globe, ArrowUpRight, FileText, Receipt,
  Truck, Activity, DollarSign,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { InvoiceStatusBadge } from "@/components/primitives/InvoiceStatusBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface SubsidiaryRow {
  id: string;
  name: string;
  code: string;
  country: CountryCode;
}

interface VehicleSummary {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
}

interface InvoiceSummary {
  id: string;
  invoice_number: string;
  status: string;
  period_start: string;
  total_due: number;
  balance_outstanding: number;
  currency: string;
}

function money(n: number, c = "USD"): string {
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default async function SubsidiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("admin");
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const last90 = new Date(); last90.setDate(last90.getDate() - 90);
  const last90Iso = last90.toISOString().slice(0, 10);

  const [{ data: sub }, breakdownRes, { data: vehicles }, { data: invoices }] = await Promise.all([
    supabase.schema("app").from("subsidiaries").select("id, name, code, country").eq("id", id).maybeSingle<SubsidiaryRow>(),
    supabase.schema("app").rpc("fn_subsidiary_breakdown", { p_period_start: last90Iso, p_period_end: today }),
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model")
      .eq("default_subsidiary_id", id)
      .neq("status", "decommissioned")
      .returns<VehicleSummary[]>(),
    supabase
      .schema("app")
      .from("invoices")
      .select("id, invoice_number, status, period_start, total_due, balance_outstanding, currency")
      .eq("subsidiary_id", id)
      .order("period_start", { ascending: false })
      .limit(12)
      .returns<InvoiceSummary[]>(),
  ]);

  if (!sub) notFound();

  const breakdown = Array.isArray(breakdownRes.data) ? breakdownRes.data.find(
    (r: { subsidiary_id: string }) => r.subsidiary_id === id,
  ) as { trips: number; km: number; revenue: number; outstanding: number } | undefined : undefined;

  const trips = Number(breakdown?.trips ?? 0);
  const km = Number(breakdown?.km ?? 0);
  const revenue = Number(breakdown?.revenue ?? 0);
  const outstanding = Number(breakdown?.outstanding ?? 0);
  const totalInvoices = (invoices ?? []).length;
  const paidCount = (invoices ?? []).filter((i) => i.status === "paid").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <Link
        href="/subsidiaries"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to subsidiaries
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-700 to-ink-900 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start gap-5 flex-wrap">
          <div className="h-20 w-20 rounded-2xl bg-white/10 backdrop-blur border border-white/15 flex items-center justify-center shrink-0">
            <Building className="h-10 w-10 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-2 border border-white/10">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white font-bold font-plate">
                {sub.code}
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{sub.name}</h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                {sub.country === "ZW" ? "Zimbabwe" : "South Africa"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-slate-400" />
                {(vehicles ?? []).length} default vehicles
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} tone="brand" label="Revenue (90d)" value={money(revenue)} />
        <Kpi
          icon={Receipt}
          tone={outstanding > 0 ? "rose" : "emerald"}
          label="Outstanding"
          value={money(outstanding)}
        />
        <Kpi icon={Activity} tone="sky" label="Trips (90d)" value={trips.toLocaleString()} />
        <Kpi
          icon={FileText}
          tone="violet"
          label="Invoices"
          value={`${paidCount} / ${totalInvoices}`}
          hint="paid / total"
        />
      </div>

      {/* Vehicles + Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Default vehicles */}
        <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-900">Default vehicles</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Vehicles whose default subsidiary is set to {sub.name}
              </p>
            </div>
            <Link href="/vehicles" className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {(vehicles ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500 italic text-center">
              No vehicles default-billed to this subsidiary
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(vehicles ?? []).slice(0, 8).map((v) => (
                <li key={v.id} className="px-5 py-3 flex items-center gap-3">
                  <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />
                  <span className="flex-1 text-sm font-medium text-ink-900 truncate">
                    {v.make} {v.model}
                  </span>
                  <Link
                    href={`/vehicles/${v.id}`}
                    className="text-ink-300 hover:text-orange-600"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Invoice history */}
        <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-900">Invoice history</h2>
              <p className="text-xs text-ink-500 mt-0.5">Last 12 issued invoices</p>
            </div>
            <Link href="/invoices" className="text-xs font-semibold text-orange-600 hover:underline inline-flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {(invoices ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500 italic text-center">
              No invoices generated yet
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(invoices ?? []).map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-ink-50/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-plate text-xs font-bold text-ink-900 truncate">
                        {inv.invoice_number}
                      </p>
                      <p className="text-[11px] text-ink-500 mt-0.5">
                        {fmtMonth(inv.period_start)}
                      </p>
                    </div>
                    <InvoiceStatusBadge status={inv.status} />
                    <div className="text-right shrink-0">
                      <p className="font-plate text-sm font-bold text-ink-900 tabular">
                        {money(inv.total_due, inv.currency)}
                      </p>
                      {Number(inv.balance_outstanding) > 0 && (
                        <p className="text-[10px] text-rose-700 font-bold font-plate mt-0.5">
                          {money(inv.balance_outstanding, inv.currency)} due
                        </p>
                      )}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-ink-300 ml-2" />
                  </Link>
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
  tone: "brand" | "sky" | "violet" | "rose" | "emerald";
  label: string;
  value: string;
  hint?: string;
}) {
  const t = {
    brand: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    rose: { bg: "bg-rose-50", text: "text-rose-600", ring: "ring-rose-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring} flex items-center justify-center mb-3`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-2xl font-bold text-ink-900 tabular font-plate mt-1">{value}</p>
      {hint && <p className="text-[11px] text-ink-500 mt-1">{hint}</p>}
    </div>
  );
}
