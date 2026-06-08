import Link from "next/link";
import { Wrench, ArrowUpRight, Clock, CheckCircle2, XCircle, DollarSign } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

type Status = "submitted" | "approved" | "rejected";

interface ClaimRow {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: Status;
  created_at: string;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  profiles: { full_name: string | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function RepairsPage() {
  await requireRole("fleet_manager", "admin", "subsidiary_billing");
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("app")
    .from("repair_claims")
    .select(`
      id, description, amount, currency, status, created_at,
      vehicles(plate_number, plate_country, make, model),
      profiles!repair_claims_submitted_by_fkey(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<ClaimRow[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load repair claims: {error.message}
        </div>
      </div>
    );
  }

  const list = data ?? [];
  // Stats over the whole table (not just the displayed page).
  const { data: statRows } = await supabase
    .schema("app").from("repair_claims").select("status, amount").limit(20000);
  const all = (statRows ?? []) as { status: string; amount: number }[];
  const stats = {
    submitted: all.filter((c) => c.status === "submitted").length,
    approved: all.filter((c) => c.status === "approved").length,
    rejected: all.filter((c) => c.status === "rejected").length,
    pendingValue: all
      .filter((c) => c.status === "submitted")
      .reduce((s, c) => s + Number(c.amount), 0),
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Repair claims</h1>
        <p className="text-sm text-ink-500 mt-1">
          Driver and subsidiary repair expenses awaiting review. Approved claims become
          reimbursable maintenance credits on the next invoice.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={Clock} tone="amber" label="Awaiting review" value={String(stats.submitted)} />
        <Tile icon={CheckCircle2} tone="emerald" label="Approved" value={String(stats.approved)} />
        <Tile icon={XCircle} tone="rose" label="Rejected" value={String(stats.rejected)} />
        <Tile icon={DollarSign} tone="brand" label="Pending value" value={stats.pendingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
      </div>

      {all.length > list.length && (
        <p className="text-xs text-ink-500">Showing the latest {list.length.toLocaleString()} of {all.length.toLocaleString()}.</p>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Wrench className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No repair claims yet</p>
          <p className="text-xs text-ink-500 mt-1">
            Drivers submit repairs with a receipt photo from the mobile app.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Repair</th>
                <th className="px-6 py-3 text-left">Submitted by</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-left">When</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-ink-50/40 transition-colors group">
                  <td className="px-6 py-4"><StatusPill status={c.status} /></td>
                  <td className="px-6 py-4">
                    {c.vehicles && (
                      <Link href={`/repairs/${c.id}`} className="block">
                        <PlateBadge plate={c.vehicles.plate_number} country={c.vehicles.plate_country} size="sm" />
                        <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                          {c.vehicles.make} {c.vehicles.model}
                        </p>
                      </Link>
                    )}
                  </td>
                  <td className="px-6 py-4 text-ink-700 max-w-[280px]">
                    <p className="truncate">{c.description}</p>
                  </td>
                  <td className="px-6 py-4 text-ink-700">{c.profiles?.full_name ?? "—"}</td>
                  <td className="px-6 py-4 text-right font-plate text-sm text-ink-900 font-bold tabular">
                    {c.currency} {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 text-xs text-ink-500">{fmt(c.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/repairs/${c.id}`}
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
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: Status }) {
  const cfg = {
    submitted: { label: "Awaiting review", bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    approved: { label: "Approved", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    rejected: { label: "Rejected", bg: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium ${cfg.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
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
      <p className={`text-2xl font-bold ${t.text} tabular mt-2`}>{value}</p>
    </div>
  );
}
