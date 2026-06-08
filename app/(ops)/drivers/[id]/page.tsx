import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, MapPin, Stethoscope, ShieldCheck, IdCard, Calendar, Home, UserCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AssignmentPanel } from "@/components/ops/AssignmentPanel";
import { DriverEditButton } from "@/components/ops/DriverEditButton";
import { DeleteEntityButton } from "@/components/ops/DeleteEntityButton";
import { DriverInsights } from "@/components/ops/DriverInsights";
import { DriverScorecard } from "@/components/ops/DriverScorecard";
import { ExpiryBadge } from "@/components/primitives/ExpiryBadge";
import type { CountryCode, DriverRow, TripStatus, DriverScorecard as Scorecard } from "@/types/domain";

export const dynamic = "force-dynamic";

interface DriverDetail extends DriverRow {
  profiles: {
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    subsidiary_id: string | null;
  } | null;
}

interface AssignmentItem {
  id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
}

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

function gradientFromName(name: string): string {
  const gradients = [
    "from-orange-400 to-pink-500",
    "from-sky-400 to-blue-600",
    "from-emerald-400 to-teal-600",
    "from-violet-400 to-purple-600",
    "from-amber-400 to-orange-600",
    "from-rose-400 to-red-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return gradients[Math.abs(hash) % gradients.length];
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: driver }, { data: assignments }, { data: subs }, { data: availableVehicles }, { data: trips }] =
    await Promise.all([
      supabase
        .schema("app")
        .from("drivers")
        .select(`*, profiles!inner(full_name, phone, avatar_url, subsidiary_id)`)
        .eq("id", id)
        .single<DriverDetail>(),
      supabase
        .schema("app")
        .from("vehicle_assignments")
        .select("id, vehicle_id, started_at, ended_at, vehicles(plate_number, plate_country, make, model)")
        .eq("driver_id", id)
        .order("started_at", { ascending: false })
        .returns<AssignmentItem[]>(),
      supabase.schema("app").from("subsidiaries").select("id, name").order("name"),
      supabase
        .schema("app")
        .from("vehicles")
        .select("id, plate_number, plate_country, make, model, status")
        .in("status", ["available", "maintenance"])
        .order("plate_number"),
      supabase
        .schema("app")
        .from("trips")
        .select("started_at, start_odometer_km, end_odometer_km, status")
        .eq("driver_id", id)
        .limit(500)
        .returns<TripAgg[]>(),
    ]);

  if (!driver) notFound();

  const { data: scorecard } = await supabase
    .schema("app")
    .rpc("fn_driver_scorecard", { p_driver_id: id })
    .maybeSingle<Scorecard>();

  const name = driver.profiles?.full_name ?? "Unknown driver";
  const current = (assignments ?? []).find((a) => a.ended_at === null) ?? null;
  const history = (assignments ?? []).filter((a) => a.ended_at !== null);

  // Vehicles already assigned are excluded from the picker
  const { data: activeAssignments } = await supabase
    .schema("app")
    .from("vehicle_assignments")
    .select("vehicle_id")
    .is("ended_at", null)
    .returns<{ vehicle_id: string }[]>();
  const usedVehicleIds = new Set((activeAssignments ?? []).map((a) => a.vehicle_id));
  const pickable = (availableVehicles ?? []).filter((v) => !usedVehicleIds.has(v.id));

  const subsidiary = (subs ?? []).find((s) => s.id === driver.profiles?.subsidiary_id);

  // Insight aggregations
  const allTrips = trips ?? [];
  const completed = allTrips.filter(
    (t) => t.status === "completed" && t.start_odometer_km != null && t.end_odometer_km != null,
  );
  const cancelled = allTrips.filter((t) => t.status === "cancelled").length;
  const totalKm = completed.reduce(
    (s, t) => s + Math.max(0, (t.end_odometer_km ?? 0) - (t.start_odometer_km ?? 0)),
    0,
  );
  const totalTrips = allTrips.length;
  const avgTripKm = completed.length > 0 ? Math.round(totalKm / completed.length) : 0;
  const cancellationRate = totalTrips > 0 ? cancelled / totalTrips : 0;
  const yearsActive = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(driver.created_at).getTime()) / (365.25 * 86_400_000),
    ),
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <Link
        href="/drivers"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to drivers
      </Link>

      {/* Hero with edit button */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative flex items-start justify-between flex-wrap gap-5">
          <div className="flex items-start gap-5">
            <div
              className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${gradientFromName(name)} flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-white/10 shadow-xl`}
            >
              {initials(name)}
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10">
                <span className={`h-1.5 w-1.5 rounded-full ${driver.is_active ? "bg-emerald-400" : "bg-slate-400"}`} />
                <span className="text-[10px] uppercase tracking-[0.14em] text-white font-bold">
                  {driver.is_active ? "Active driver" : "Inactive"}
                </span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{name}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                {driver.profiles?.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-plate">{driver.profiles.phone}</span>
                  </span>
                )}
                {driver.employee_number && (
                  <span className="inline-flex items-center gap-1.5">
                    <IdCard className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-plate">{driver.employee_number}</span>
                  </span>
                )}
                {subsidiary && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {subsidiary.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DriverEditButton
              driver={{
                ...driver,
                profile: driver.profiles
                  ? {
                      full_name: driver.profiles.full_name,
                      phone: driver.profiles.phone,
                      subsidiary_id: driver.profiles.subsidiary_id,
                    }
                  : undefined,
              }}
              driverName={name}
              subsidiaries={subs ?? []}
            />
            {profile.role === "admin" && (
              <DeleteEntityButton
                entity="driver"
                id={id}
                label={name}
                redirectTo="/drivers"
              />
            )}
          </div>
        </div>
      </div>

      {/* Credential fact cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <FactCard
          icon={IdCard}
          tone="sky"
          label="Licence"
          value={`${driver.licence_country} · ${driver.licence_number}`}
          mono
        />
        <FactCard
          icon={Calendar}
          tone={driver.licence_expires_at ? "amber" : "ink"}
          label="Licence expires"
          value={
            driver.licence_expires_at
              ? new Date(driver.licence_expires_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })
              : "—"
          }
          badge={
            driver.licence_expires_at ? <ExpiryBadge expiresAt={driver.licence_expires_at} /> : undefined
          }
        />
        <FactCard
          icon={ShieldCheck}
          tone="emerald"
          label="Defensive cert."
          value={
            driver.defensive_driving_cert_at
              ? new Date(driver.defensive_driving_cert_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })
              : "Not on file"
          }
        />
        <FactCard
          icon={Stethoscope}
          tone="violet"
          label="Medical cert."
          value={
            driver.medical_cert_expires_at
              ? new Date(driver.medical_cert_expires_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })
              : "Not on file"
          }
          badge={
            driver.medical_cert_expires_at
              ? <ExpiryBadge expiresAt={driver.medical_cert_expires_at} />
              : undefined
          }
        />
      </div>

      {/* Safety & performance score */}
      {scorecard && (
        <section>
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink-900">Safety &amp; performance score</h2>
              <p className="text-sm text-ink-500 mt-0.5">Composite rating from trips, incidents and checks</p>
            </div>
            <Link href="/drivers/scorecards" className="text-xs font-semibold text-orange-600 hover:underline">
              View leaderboard
            </Link>
          </header>
          <DriverScorecard score={scorecard} />
        </section>
      )}

      {/* Insights section */}
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-bold text-ink-900">Performance & insights</h2>
          <p className="text-sm text-ink-500 mt-0.5">Activity trends and reliability</p>
        </header>
        <DriverInsights
          monthly={buildMonthlyAgg(allTrips)}
          totalKm={totalKm}
          totalTrips={totalTrips}
          avgTripKm={avgTripKm}
          cancellationRate={cancellationRate}
          yearsActive={yearsActive}
        />
      </section>

      {/* Assignment + Licence/Contact compact */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AssignmentPanel
            driverId={id}
            current={current}
            history={history}
            availableVehicles={pickable}
          />
        </div>

        <div className="space-y-4">
          {driver.licence_classes && driver.licence_classes.length > 0 && (
            <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-3">
                Licence classes
              </p>
              <div className="flex flex-wrap gap-2">
                {driver.licence_classes.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center rounded-lg bg-ink-900 text-white px-2.5 py-1 text-xs font-plate font-bold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(driver.next_of_kin_name || driver.home_address) && (
            <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-4">
              {driver.next_of_kin_name && (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center shrink-0">
                    <UserCheck className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
                      Next of kin
                    </p>
                    <p className="text-sm font-semibold text-ink-900 mt-0.5">
                      {driver.next_of_kin_name}
                    </p>
                    {driver.next_of_kin_phone && (
                      <p className="text-xs text-ink-500 font-plate mt-0.5">
                        {driver.next_of_kin_phone}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {driver.home_address && (
                <div className="flex items-start gap-3 pt-3 border-t border-ink-100">
                  <div className="h-9 w-9 rounded-lg bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center shrink-0">
                    <Home className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
                      Home address
                    </p>
                    <p className="text-sm text-ink-700 mt-0.5 whitespace-pre-line">
                      {driver.home_address}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FactCard({
  icon: Icon,
  tone,
  label,
  value,
  mono,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "amber" | "emerald" | "violet" | "ink";
  label: string;
  value: string;
  mono?: boolean;
  badge?: React.ReactNode;
}) {
  const toneMap = {
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    ink: "bg-ink-100 text-ink-600 ring-ink-200",
  };
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        {badge}
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className={`mt-1 text-sm font-bold text-ink-900 truncate ${mono ? "font-plate text-base" : ""}`}>
        {value}
      </p>
    </div>
  );
}
