import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, User, Building2, Calendar, Truck, Fuel, Droplets, CircleDot, Banknote, TrendingDown, History } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { VehicleStatusBadge } from "@/components/primitives/VehicleStatusBadge";
import { DocumentPanel } from "@/components/ops/DocumentPanel";
import { VehicleEditButton } from "@/components/ops/VehicleEditButton";
import { DeleteEntityButton } from "@/components/ops/DeleteEntityButton";
import { VehicleInsights } from "@/components/ops/VehicleInsights";
import type { VehicleRow, DocumentRow, CountryCode, TripStatus, FuelEfficiency, TyreRow, VehicleDepreciation, AuditEntry } from "@/types/domain";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

interface TripAgg {
  started_at: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  status: TripStatus;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildMonthlyAgg(trips: TripAgg[]) {
  const buckets: { month: string; key: string; km: number; trips: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      month: MONTHS[d.getMonth()],
      key: `${d.getFullYear()}-${d.getMonth()}`,
      km: 0,
      trips: 0,
    });
  }
  for (const t of trips) {
    if (!t.started_at) continue;
    const d = new Date(t.started_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find((x) => x.key === key);
    if (!b) continue;
    b.trips += 1;
    if (t.start_odometer_km != null && t.end_odometer_km != null) {
      b.km += Math.max(0, t.end_odometer_km - t.start_odometer_km);
    }
  }
  return buckets.map(({ month, km, trips }) => ({ month, km, trips }));
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: vehicle }, { data: docs }, { data: subsidiaries }, { data: assignment }, { data: trips }] =
    await Promise.all([
      supabase
        .schema("app")
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .single<VehicleRow>(),
      supabase
        .schema("app")
        .from("vehicle_documents")
        .select("*")
        .eq("vehicle_id", id)
        .eq("is_active", true)
        .order("document_type")
        .returns<DocumentRow[]>(),
      supabase
        .schema("app")
        .from("subsidiaries")
        .select("id, name")
        .order("name")
        .returns<Database["app"]["Tables"]["subsidiaries"]["Row"][]>(),
      supabase
        .schema("app")
        .from("vehicle_assignments")
        .select("driver_id, drivers(id, profiles(full_name))")
        .eq("vehicle_id", id)
        .is("ended_at", null)
        .maybeSingle<{
          driver_id: string;
          drivers: { id: string; profiles: { full_name: string | null } | null } | null;
        }>(),
      supabase
        .schema("app")
        .from("trips")
        .select("started_at, start_odometer_km, end_odometer_km, status")
        .eq("vehicle_id", id)
        .order("started_at", { ascending: false })
        .limit(500)
        .returns<TripAgg[]>(),
    ]);

  if (!vehicle) notFound();

  // Phase 11 — fuel efficiency + fitted tyres for the maintenance panel.
  const [{ data: fuelEff }, { data: fittedTyres }] = await Promise.all([
    supabase
      .schema("app")
      .rpc("fn_vehicle_fuel_efficiency", { p_vehicle_id: id })
      .maybeSingle<FuelEfficiency>(),
    supabase
      .schema("app")
      .from("tyres")
      .select("id, position, brand, size, tread_depth_mm, fitted_odometer_km")
      .eq("vehicle_id", id)
      .eq("status", "in_service")
      .order("position")
      .returns<Pick<TyreRow, "id" | "position" | "brand" | "size" | "tread_depth_mm" | "fitted_odometer_km">[]>(),
  ]);

  // Phase 13 — depreciation + (admin-only) change history.
  const { data: deprec } = await supabase
    .schema("app")
    .rpc("fn_vehicle_depreciation", { p_vehicle_id: id })
    .maybeSingle<VehicleDepreciation>();

  let auditEntries: AuditEntry[] = [];
  if (profile.role === "admin") {
    const { data: aud } = await supabase
      .schema("app")
      .rpc("fn_audit_for_row", { p_schema: "app", p_table: "vehicles", p_pk: id })
      .returns<AuditEntry[]>();
    auditEntries = Array.isArray(aud) ? aud : [];
  }

  const currentDriver = assignment?.drivers?.profiles?.full_name ?? null;
  const subsidiary = subsidiaries?.find((s) => s.id === vehicle.default_subsidiary_id) ?? null;

  const completed = (trips ?? []).filter(
    (t) => t.status === "completed" && t.start_odometer_km != null && t.end_odometer_km != null,
  );
  const totalTrips = (trips ?? []).filter((t) => t.status !== "cancelled").length;
  const totalKm = completed.reduce(
    (s, t) => s + Math.max(0, (t.end_odometer_km ?? 0) - (t.start_odometer_km ?? 0)),
    0,
  );
  const avgTripKm = completed.length > 0 ? Math.round(totalKm / completed.length) : 0;

  const sinceLastService =
    vehicle.last_service_odometer_km != null
      ? Math.max(0, vehicle.current_odometer_km - vehicle.last_service_odometer_km)
      : vehicle.current_odometer_km;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Back link */}
      <Link
        href="/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to fleet
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-6">
          <div className="flex items-start gap-5">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-xl shadow-orange-500/30 shrink-0">
              <Truck className="h-9 w-9 text-white" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PlateBadge plate={vehicle.plate_number} country={vehicle.plate_country} />
                <VehicleStatusBadge status={vehicle.status} />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
                {vehicle.make} {vehicle.model}
              </h1>
              {vehicle.variant && (
                <p className="text-sm text-slate-300 mt-0.5">{vehicle.variant}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                {currentDriver && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {currentDriver}
                  </span>
                )}
                {subsidiary && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    {subsidiary.name}
                  </span>
                )}
                {vehicle.home_branch && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {vehicle.home_branch}
                  </span>
                )}
                {vehicle.year_of_manufacture && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {vehicle.year_of_manufacture}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Odometer mega-display */}
          <div className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 px-6 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
              Current odometer
            </p>
            <p className="font-plate text-3xl lg:text-4xl font-bold text-white tabular mt-1">
              {vehicle.current_odometer_km.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400">kilometres</p>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-sm text-ink-500">
          <span className="font-medium text-ink-700">Specifications</span>
          <span>·</span>
          <span className="capitalize">{vehicle.class.replace("_", " ")}</span>
          <span>·</span>
          <span className="capitalize">{vehicle.fuel_type}</span>
          {vehicle.colour && (
            <>
              <span>·</span>
              <span>{vehicle.colour}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <VehicleEditButton vehicle={vehicle} subsidiaries={subsidiaries ?? []} />
          {profile.role === "admin" && (
            <DeleteEntityButton
              entity="vehicle"
              id={vehicle.id}
              label={`${vehicle.plate_number} · ${vehicle.make} ${vehicle.model}`}
              redirectTo="/vehicles"
            />
          )}
        </div>
      </div>

      {/* Key facts mini cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KeyFact label="VIN / Chassis" value={vehicle.vin ?? "—"} mono />
        <KeyFact label="Engine number" value={vehicle.engine_number ?? "—"} mono />
        <KeyFact label="Last service" value={
          vehicle.last_service_odometer_km != null
            ? `${vehicle.last_service_odometer_km.toLocaleString()} km`
            : "Not recorded"
        } />
        <KeyFact label="Acquired" value={
          vehicle.acquired_at
            ? new Date(vehicle.acquired_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
            : "—"
        } />
      </div>

      {/* Insights / charts */}
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-bold text-ink-900">Performance & insights</h2>
          <p className="text-sm text-ink-500 mt-0.5">Trips, distance and service trends</p>
        </header>
        <VehicleInsights
          monthly={buildMonthlyAgg(trips ?? [])}
          totalTrips={totalTrips}
          totalKm={totalKm}
          avgTripKm={avgTripKm}
          serviceProgress={{
            current: sinceLastService,
            interval: vehicle.service_interval_km,
            nextDueKm: (vehicle.last_service_odometer_km ?? 0) + vehicle.service_interval_km,
          }}
          fuelType={vehicle.fuel_type}
          tankLitres={vehicle.fuel_tank_litres}
        />
      </section>

      {/* Fuel & tyres */}
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-bold text-ink-900">Fuel &amp; tyres</h2>
          <p className="text-sm text-ink-500 mt-0.5">Consumption and fitted tyre positions</p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-orange-600" />
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Fuel economy</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-ink-900 font-plate tabular">
              {fuelEff?.litres_per_100km != null ? Number(fuelEff.litres_per_100km).toFixed(1) : "—"}
              <span className="text-sm font-semibold text-ink-400 ml-1">L/100km</span>
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {fuelEff && fuelEff.fill_count > 0
                ? `${fuelEff.fill_count} fills · ${Math.round(Number(fuelEff.distance_km)).toLocaleString()} km tracked`
                : "No fuel logs yet"}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-sky-600" />
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Cost / km</p>
            </div>
            <p className="mt-2 text-3xl font-bold text-ink-900 font-plate tabular">
              {fuelEff?.cost_per_km != null ? `$${Number(fuelEff.cost_per_km).toFixed(2)}` : "—"}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {fuelEff && fuelEff.total_cost > 0
                ? `$${Number(fuelEff.total_cost).toLocaleString()} fuel logged`
                : "Awaiting data"}
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <div className="flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Fitted tyres</p>
            </div>
            {fittedTyres && fittedTyres.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {fittedTyres.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className="font-plate font-semibold text-ink-700">{t.position ?? "—"}</span>
                    <span className="text-ink-500 truncate max-w-[110px]">{t.brand ?? t.size ?? "—"}</span>
                    <span className="font-plate text-xs text-ink-600">
                      {t.tread_depth_mm != null ? `${Number(t.tread_depth_mm).toFixed(1)}mm` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-400">No tyres recorded as fitted.</p>
            )}
          </div>
        </div>
      </section>

      {/* Lifecycle & depreciation */}
      <section>
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-900">Lifecycle &amp; depreciation</h2>
            <p className="text-sm text-ink-500 mt-0.5">Straight-line book value over the asset's life</p>
          </div>
          <Link href="/vehicles/lifecycle" className="text-xs font-semibold text-orange-600 hover:underline">
            Fleet register
          </Link>
        </header>
        {deprec && deprec.purchase_cost != null ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <DepCard label="Purchase cost" value={`$${Number(deprec.purchase_cost).toLocaleString()}`} tone="text-ink-900" icon={Banknote} />
            <DepCard
              label="Net book value"
              value={deprec.book_value != null ? `$${Number(deprec.book_value).toLocaleString()}` : "—"}
              tone="text-emerald-600"
              icon={Banknote}
            />
            <DepCard
              label="Accumulated dep."
              value={deprec.accumulated_depreciation != null ? `$${Number(deprec.accumulated_depreciation).toLocaleString()}` : "—"}
              tone="text-amber-600"
              icon={TrendingDown}
            />
            <DepCard
              label="Cost / km"
              value={deprec.cost_per_km != null ? `$${Number(deprec.cost_per_km).toFixed(3)}` : "—"}
              tone="text-violet-600"
              icon={TrendingDown}
            />
            {deprec.depreciation_pct != null && (
              <div className="lg:col-span-4 rounded-2xl bg-white border border-ink-200/70 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
                    Depreciated {Number(deprec.depreciation_pct).toFixed(0)}%
                    {deprec.age_years != null ? ` · ${Number(deprec.age_years).toFixed(1)} years old` : ""}
                  </p>
                  {deprec.is_disposed && (
                    <span className="text-[10px] uppercase tracking-wide text-rose-600 font-bold">Disposed</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{ width: `${Math.min(100, Number(deprec.depreciation_pct))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5 text-sm text-ink-500">
            No purchase cost on file. Add a purchase cost, acquisition date and useful life via{" "}
            <span className="font-semibold text-ink-700">Edit</span> to track depreciation.
          </div>
        )}
      </section>

      {/* Compliance documents */}
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-bold text-ink-900">Compliance documents</h2>
          <p className="text-sm text-ink-500 mt-0.5">
            License disc, insurance, fitness and registration papers
          </p>
        </header>
        <DocumentPanel vehicleId={id} documents={docs ?? []} />
      </section>

      {/* Condition notes */}
      {vehicle.condition_notes && (
        <section className="rounded-2xl bg-amber-50/50 border border-amber-200 p-5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-bold mb-1">
            Condition notes
          </p>
          <p className="text-sm text-ink-700 whitespace-pre-line">{vehicle.condition_notes}</p>
        </section>
      )}

      {/* Change history (admin only) */}
      {profile.role === "admin" && auditEntries.length > 0 && (
        <section>
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-900">Change history</h2>
              <p className="text-sm text-ink-500 mt-0.5">Audited record of edits to this vehicle</p>
            </div>
            <Link href="/audit?table=vehicles" className="text-xs font-semibold text-orange-600 hover:underline">
              Full audit log
            </Link>
          </header>
          <div className="rounded-2xl bg-white border border-ink-200/70 divide-y divide-ink-100">
            {auditEntries.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
                    e.operation === "INSERT"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : e.operation === "DELETE"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-sky-50 text-sky-700 border-sky-200"
                  }`}
                >
                  {e.operation === "INSERT" ? "Created" : e.operation === "DELETE" ? "Deleted" : "Updated"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-800 truncate">
                    {e.operation === "UPDATE" && e.changed_columns
                      ? e.changed_columns.join(", ")
                      : "Record " + e.operation.toLowerCase()}
                  </p>
                  <p className="text-xs text-ink-500">{e.actor_name ?? "System"}</p>
                </div>
                <History className="h-3.5 w-3.5 text-ink-300 shrink-0" />
                <span className="text-xs text-ink-400 shrink-0">
                  {new Date(e.occurred_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DepCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      </div>
      <p className={`mt-1.5 text-xl font-bold font-plate tabular ${tone}`}>{value}</p>
    </div>
  );
}

function KeyFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className={`mt-1.5 text-sm font-semibold text-ink-900 truncate ${mono ? "font-plate" : ""}`}>
        {value}
      </p>
    </div>
  );
}
