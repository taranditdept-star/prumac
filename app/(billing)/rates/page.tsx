import { DollarSign, Truck, Building2, Calendar } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface RateRow {
  id: string;
  mode: string;
  rate_amount: number;
  currency: string;
  radius_km: number | null;
  effective_from: string;
  effective_until: string | null;
  notes: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  subsidiaries: { name: string } | null;
}

const modeLabels: Record<string, string> = {
  per_km: "Per km",
  per_litre_100km: "Per L per 100 km",
  per_load: "Per load",
  fixed_monthly: "Fixed monthly",
};

const modeTones: Record<string, string> = {
  per_km: "bg-orange-50 text-orange-700 border-orange-200",
  per_litre_100km: "bg-violet-50 text-violet-700 border-violet-200",
  per_load: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fixed_monthly: "bg-sky-50 text-sky-700 border-sky-200",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "open";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function RatesPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const { data: rates } = await supabase
    .schema("app")
    .from("billing_rates")
    .select(`
      id, mode, rate_amount, currency, radius_km,
      effective_from, effective_until, notes,
      vehicles(plate_number, plate_country, make, model),
      subsidiaries(name)
    `)
    .lte("effective_from", today)
    .or(`effective_until.is.null,effective_until.gt.${today}`)
    .order("vehicles(plate_number)", { ascending: true })
    .returns<RateRow[]>();

  const list = rates ?? [];

  const byMode = {
    per_km: list.filter((r) => r.mode === "per_km").length,
    per_litre_100km: list.filter((r) => r.mode === "per_litre_100km").length,
    per_load: list.filter((r) => r.mode === "per_load").length,
    fixed_monthly: list.filter((r) => r.mode === "fixed_monthly").length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Billing rates</h1>
        <p className="text-sm text-ink-500 mt-1">
          What PRUMAC charges per vehicle, currently effective ({list.length} active)
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Per km" value={byMode.per_km} tone="brand" />
        <Tile label="Per L per 100km" value={byMode.per_litre_100km} tone="violet" />
        <Tile label="Per load" value={byMode.per_load} tone="emerald" />
        <Tile label="Fixed monthly" value={byMode.fixed_monthly} tone="sky" />
      </div>

      <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
              <th className="px-6 py-3 text-left">Vehicle</th>
              <th className="px-6 py-3 text-left">Mode</th>
              <th className="px-6 py-3 text-left">Applies to</th>
              <th className="px-6 py-3 text-right">Rate</th>
              <th className="px-6 py-3 text-left">Effective from</th>
              <th className="px-6 py-3 text-left">Until</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {list.map((r) => (
              <tr key={r.id} className="hover:bg-ink-50/40 transition-colors">
                <td className="px-6 py-4">
                  {r.vehicles && (
                    <>
                      <PlateBadge
                        plate={r.vehicles.plate_number}
                        country={r.vehicles.plate_country}
                        size="sm"
                      />
                      <p className="text-xs text-ink-500 mt-1 truncate max-w-[160px]">
                        {r.vehicles.make} {r.vehicles.model}
                      </p>
                    </>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-medium ${modeTones[r.mode] ?? ""}`}>
                    {modeLabels[r.mode] ?? r.mode}
                  </span>
                  {r.radius_km && (
                    <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold mt-1">
                      Radius {r.radius_km} km
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <p className="text-ink-700">
                    {r.subsidiaries?.name ?? (
                      <span className="text-ink-400 italic">All subsidiaries (default)</span>
                    )}
                  </p>
                  {r.notes && <p className="text-[11px] text-ink-500 mt-0.5">{r.notes}</p>}
                </td>
                <td className="px-6 py-4 text-right">
                  <p className="font-plate font-bold text-ink-900 tabular">
                    {r.currency} {Number(r.rate_amount).toFixed(r.mode === "per_litre_100km" ? 4 : 2)}
                  </p>
                </td>
                <td className="px-6 py-4 text-ink-700 font-plate text-xs">{fmtDate(r.effective_from)}</td>
                <td className="px-6 py-4 text-ink-500 font-plate text-xs">
                  {r.effective_until ? fmtDate(r.effective_until) : (
                    <span className="text-emerald-600 font-bold">open-ended</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-ink-500">No active rates configured.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "violet" | "emerald" | "sky";
}) {
  const t = {
    brand: { bg: "bg-orange-500/10", text: "text-orange-600" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-600" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
  }[tone];
  return (
    <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
      <div className={`absolute top-0 right-0 h-20 w-20 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <DollarSign className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${t.text} tabular mt-2`}>{value}</p>
    </div>
  );
}
