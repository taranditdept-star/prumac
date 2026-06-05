import Link from "next/link";
import { Truck, Filter, Search, Plus, ArrowUpRight } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { VehicleStatusBadge } from "@/components/primitives/VehicleStatusBadge";
import { getExpiryUrgency } from "@/lib/utils/expiry";
import type { VehicleRow, DocumentRow } from "@/types/domain";

export const dynamic = "force-dynamic";

const classIcon: Record<string, string> = {
  tanker: "🛢", truck: "🚚", minibus: "🚐", bakkie: "🛻",
  suv: "🚙", sedan: "🚗", farm_vehicle: "🚜", specialist: "🏗",
};

export default async function VehiclesPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: vehicles, error } = await supabase
    .schema("app")
    .from("vehicles")
    .select("*")
    .neq("status", "decommissioned")
    .order("make")
    .order("model")
    .returns<VehicleRow[]>();

  const { data: docs } = await supabase
    .schema("app")
    .from("vehicle_documents")
    .select("vehicle_id, document_type, expires_at")
    .eq("is_active", true)
    .returns<Pick<DocumentRow, "vehicle_id" | "document_type" | "expires_at">[]>();

  const docsByVehicle = new Map<string, typeof docs>();
  for (const d of docs ?? []) {
    if (!docsByVehicle.has(d.vehicle_id)) docsByVehicle.set(d.vehicle_id, []);
    docsByVehicle.get(d.vehicle_id)!.push(d);
  }

  const urgencyRank = { expired: 0, critical: 1, warning: 2, ok: 3 } as const;
  const ranked = [...(vehicles ?? [])].sort((a, b) => {
    const rankA = Math.min(
      ...(docsByVehicle.get(a.id) ?? []).map((d) => urgencyRank[getExpiryUrgency(d.expires_at)]),
      3,
    );
    const rankB = Math.min(
      ...(docsByVehicle.get(b.id) ?? []).map((d) => urgencyRank[getExpiryUrgency(d.expires_at)]),
      3,
    );
    return rankA - rankB;
  });

  const counts = {
    total: ranked.length,
    available: ranked.filter((v) => v.status === "available").length,
    onTrip: ranked.filter((v) => v.status === "on_trip").length,
    maintenance: ranked.filter((v) => v.status === "maintenance" || v.status === "workshop").length,
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load vehicles: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Vehicles</h1>
          <p className="text-sm text-ink-500 mt-1">
            Manage your fleet of {counts.total} active vehicles
          </p>
        </div>
        <Link
          href="/vehicles/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Add vehicle
        </Link>
      </div>

      {/* Quick stats with subtle gradients */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-orange-500/5 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Total fleet</p>
          <p className="text-2xl font-bold text-ink-900 tabular mt-2">{counts.total}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-emerald-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Available</p>
          <p className="text-2xl font-bold text-emerald-600 tabular mt-2">{counts.available}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-sky-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">On trip</p>
          <p className="text-2xl font-bold text-sky-600 tabular mt-2">{counts.onTrip}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-amber-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">In repair</p>
          <p className="text-2xl font-bold text-amber-600 tabular mt-2">{counts.maintenance}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search by plate, make, model…"
            className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all"
          />
        </div>
        <button
          type="button"
          className="h-10 px-4 rounded-xl border border-ink-200 bg-white text-sm font-medium text-ink-600 hover:bg-ink-50 inline-flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filter
        </button>
      </div>

      {/* Card-row table */}
      <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {ranked.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
              <Truck className="h-6 w-6 text-ink-400" />
            </div>
            <p className="text-sm font-semibold text-ink-900">No vehicles yet</p>
            <p className="text-xs text-ink-500 mt-1 mb-4">Add your first vehicle.</p>
            <Link
              href="/vehicles/new"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add vehicle
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/50 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <th className="px-6 py-3 text-left">Vehicle</th>
                <th className="px-6 py-3 text-left">Plate</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Branch</th>
                <th className="px-6 py-3 text-right">Odometer</th>
                <th className="px-6 py-3 text-left">Compliance</th>
                <th className="px-6 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {ranked.map((v) => {
                const vehicleDocs = docsByVehicle.get(v.id) ?? [];
                const expiredDocs = vehicleDocs.filter(
                  (d) => getExpiryUrgency(d.expires_at) === "expired",
                );
                const soonDocs = vehicleDocs.filter((d) => {
                  const u = getExpiryUrgency(d.expires_at);
                  return u === "critical" || u === "warning";
                });

                return (
                  <tr
                    key={v.id}
                    className="hover:bg-ink-50/40 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/vehicles/${v.id}`} className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-ink-100 to-ink-200/80 flex items-center justify-center text-lg shrink-0">
                          {classIcon[v.class] ?? "🚗"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 group-hover:text-orange-600 transition-colors">
                            {v.make} {v.model}
                          </p>
                          <p className="text-xs text-ink-500 mt-0.5 capitalize">
                            {v.variant ?? v.class.replace("_", " ")}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/vehicles/${v.id}`}>
                        <PlateBadge plate={v.plate_number} country={v.plate_country} />
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <VehicleStatusBadge status={v.status} />
                    </td>
                    <td className="px-6 py-4 text-ink-600">{v.home_branch ?? "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-plate text-xs font-semibold text-ink-700">
                        {v.current_odometer_km.toLocaleString()} km
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {expiredDocs.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          {expiredDocs.length} expired
                        </span>
                      ) : soonDocs.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          {soonDocs.length} expiring
                        </span>
                      ) : vehicleDocs.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Compliant
                        </span>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/vehicles/${v.id}`}
                        className="inline-flex h-8 w-8 rounded-lg items-center justify-center text-ink-300 group-hover:text-orange-600 group-hover:bg-orange-50 transition-all"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
