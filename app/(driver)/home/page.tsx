import Link from "next/link";
import {
  Gauge, Truck, Play, ChevronRight, ShieldCheck, ClipboardList, ClipboardCheck, AlertOctagon,
  Activity, MapPin, Clock, CalendarDays, Award, Wrench, ArrowLeftRight,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import { SignOutButton } from "@/components/driver/SignOutButton";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ActiveTrip {
  id: string;
  status: TripStatus;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  started_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
}

interface AssignmentInfo {
  vehicles: {
    id: string;
    plate_number: string;
    plate_country: CountryCode;
    make: string;
    model: string;
    current_odometer_km: number;
  } | null;
}

interface RecentTrip {
  id: string;
  status: TripStatus;
  route_description: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode } | null;
}

function duration(start: string | null): string {
  if (!start) return "—";
  const ms = Date.now() - new Date(start).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default async function DriverHomePage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  let activeTrip: ActiveTrip | null = null;
  let assignment: AssignmentInfo | null = null;
  let assignedCount = 0;
  let recent: RecentTrip[] = [];
  let stats = { trips: 0, totalKm: 0 };
  let pendingTakeovers = 0;

  // Incoming handovers awaiting this driver's confirmation
  const { data: handovers } = await supabase.schema("app").rpc("fn_my_handovers");
  if (Array.isArray(handovers)) {
    pendingTakeovers = handovers.filter(
      (h: { direction: string; status: string }) => h.direction === "incoming" && h.status === "pending",
    ).length;
  }

  if (driver) {
    const [{ data: trip }, { data: a }, { data: r }, { data: allTrips }] = await Promise.all([
      supabase
        .schema("app")
        .from("trips")
        .select("id, status, route_description, origin_label, destination_label, start_odometer_km, started_at, vehicles(plate_number, plate_country, make, model)")
        .eq("driver_id", driver.id)
        .in("status", ["in_progress", "paused", "ended"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle<ActiveTrip>(),
      supabase
        .schema("app")
        .from("vehicle_assignments")
        .select("vehicles(id, plate_number, plate_country, make, model, current_odometer_km)")
        .eq("driver_id", driver.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .returns<AssignmentInfo[]>(),
      supabase
        .schema("app")
        .from("trips")
        .select("id, status, route_description, start_odometer_km, end_odometer_km, started_at, vehicles(plate_number, plate_country)")
        .eq("driver_id", driver.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(3)
        .returns<RecentTrip[]>(),
      supabase
        .schema("app")
        .from("trips")
        .select("status, start_odometer_km, end_odometer_km")
        .eq("driver_id", driver.id)
        .eq("status", "completed")
        .returns<{ status: string; start_odometer_km: number | null; end_odometer_km: number | null }[]>(),
    ]);
    activeTrip = trip;
    assignment = a && a.length > 0 ? a[0] : null;
    assignedCount = a?.length ?? 0;
    recent = r ?? [];

    if (allTrips) {
      stats.trips = allTrips.length;
      stats.totalKm = allTrips.reduce(
        (sum, t) =>
          sum + Math.max(0, (t.end_odometer_km ?? 0) - (t.start_odometer_km ?? 0)),
        0,
      );
    }
  }

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Pending takeover banner */}
      {pendingTakeovers > 0 && (
        <Link
          href="/handover"
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 p-4 text-white active:scale-[0.99] transition-transform"
        >
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">
              {pendingTakeovers} vehicle{pendingTakeovers !== 1 ? "s" : ""} waiting for your takeover
            </p>
            <p className="text-[11px] text-white/85">Inspect and confirm to accept the vehicle</p>
          </div>
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}

      {/* Hero card — active trip OR ready to roll */}
      {activeTrip ? (
        <ActiveTripHero trip={activeTrip} />
      ) : (
        <ReadyToRollHero assignment={assignment} assignedCount={assignedCount} />
      )}

      {/* Stats strip */}
      <section className="grid grid-cols-2 gap-3">
        <MiniStat
          icon={Activity}
          label="Lifetime trips"
          value={stats.trips.toLocaleString()}
          tone="sky"
        />
        <MiniStat
          icon={Gauge}
          label="Total km driven"
          value={stats.totalKm.toLocaleString()}
          tone="violet"
        />
      </section>

      {/* Quick actions — the things a driver does on a trip */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-3 px-1">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard href="/checklist" icon={ClipboardCheck} tone="emerald" title="Vehicle checklist" subtitle="Inspect & rate condition" />
          <ActionCard href="/handover" icon={ArrowLeftRight} tone="orange" title="Handover" subtitle="Pass or take a vehicle" />
          <ActionCard href="/fault/new" icon={ClipboardList} tone="amber" title="Report fault" subtitle="Mechanical issue" />
          <ActionCard href="/accident/new" icon={AlertOctagon} tone="rose" title="Report accident" subtitle="Incident / collision" />
          {/* Repair spans the full width */}
          <Link
            href="/repair/new"
            className="col-span-2 group relative rounded-3xl bg-white border border-ink-200/70 p-4 hover:border-violet-300 active:scale-[0.98] transition-all overflow-hidden flex items-center gap-4"
          >
            <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-violet-500/10 blur-xl" />
            <div className="relative h-12 w-12 rounded-2xl bg-violet-50 ring-1 ring-violet-100 flex items-center justify-center shrink-0">
              <Wrench className="h-6 w-6 text-violet-600" />
            </div>
            <div className="relative flex-1 min-w-0">
              <p className="text-sm font-bold text-ink-900">Log a repair</p>
              <p className="text-[11px] text-ink-500 mt-0.5">Upload a receipt for reimbursement</p>
            </div>
            <ChevronRight className="relative h-4 w-4 text-ink-300 shrink-0" />
          </Link>
        </div>
      </section>

      {/* You — personal */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-3 px-1">You</p>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard href="/scorecard" icon={Award} tone="emerald" title="My scorecard" subtitle="Safety rating" />
          <ActionCard href="/leave" icon={CalendarDays} tone="sky" title="My leave" subtitle="Request time off" />
          <SignOutButton />
        </div>
      </section>

      {/* Recent trips */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
            Recent trips
          </p>
          {recent.length > 0 && (
            <Link href="/history" className="text-xs font-bold text-orange-600">
              View all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="rounded-3xl bg-white border border-ink-200/70 py-10 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
              <Clock className="h-5 w-5 text-ink-400" />
            </div>
            <p className="text-sm text-ink-700 font-semibold">No completed trips yet</p>
            <p className="text-[11px] text-ink-500 mt-0.5">
              Hit Start Trip below to log your first one
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => {
              const distance =
                t.start_odometer_km != null && t.end_odometer_km != null
                  ? t.end_odometer_km - t.start_odometer_km
                  : null;
              return (
                <Link
                  key={t.id}
                  href={`/trip/${t.id}`}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-ink-200/70 hover:border-orange-200 active:scale-[0.99] transition-all"
                >
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-900 truncate">
                      {t.route_description ?? "Trip"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {t.vehicles && (
                        <PlateBadge
                          plate={t.vehicles.plate_number}
                          country={t.vehicles.plate_country}
                          size="sm"
                        />
                      )}
                      <span className="text-[11px] text-ink-500 font-plate">
                        {distance != null ? `${distance.toLocaleString()} km` : ""}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-300" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveTripHero({ trip }: { trip: ActiveTrip }) {
  return (
    <Link href={`/trip/${trip.id}`} className="block active:scale-[0.99] transition-transform">
      <div className="relative rounded-[28px] bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-6 overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-orange-500/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <TripStatusBadge status={trip.status} />
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.14em] font-bold">Live</span>
            </div>
          </div>

          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
            Currently on a trip
          </p>
          <p className="text-2xl font-bold text-white mt-1 leading-tight">
            {trip.route_description ||
              (trip.origin_label && trip.destination_label
                ? `${trip.origin_label} → ${trip.destination_label}`
                : "Trip in progress")}
          </p>

          {/* Vehicle + duration row */}
          <div className="mt-5 flex items-center justify-between gap-3">
            {trip.vehicles && (
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur border border-white/10 flex items-center justify-center shrink-0">
                  <Truck className="h-7 w-7 text-orange-400" />
                </div>
                <div className="min-w-0">
                  <PlateBadge
                    plate={trip.vehicles.plate_number}
                    country={trip.vehicles.plate_country}
                    size="sm"
                  />
                  <p className="text-xs text-slate-300 mt-1 truncate">
                    {trip.vehicles.make} {trip.vehicles.model}
                  </p>
                </div>
              </div>
            )}
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold">
                Duration
              </p>
              <p className="text-2xl font-bold text-white tabular font-plate">
                {duration(trip.started_at)}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur border border-white/10 px-5 py-3.5">
            <span className="text-sm font-bold text-white">Manage trip</span>
            <ChevronRight className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function ReadyToRollHero({
  assignment,
  assignedCount,
}: {
  assignment: AssignmentInfo | null;
  assignedCount: number;
}) {
  const v = assignment?.vehicles;

  if (!v) {
    return (
      <div className="relative rounded-[28px] bg-gradient-to-br from-ink-100 to-ink-50 border border-ink-200 p-6 overflow-hidden">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-white items-center justify-center mb-3 ring-1 ring-ink-200">
          <Truck className="h-7 w-7 text-ink-400" />
        </div>
        <p className="text-lg font-bold text-ink-900">No vehicle assigned</p>
        <p className="text-sm text-ink-500 mt-1">
          Speak to your fleet manager to be assigned a vehicle before starting a trip.
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-[28px] bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 p-6 overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      <div className="relative">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 border border-white/20 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-white font-bold">
            Ready to roll
          </span>
        </div>

        <p className="text-[10px] uppercase tracking-[0.14em] text-white/80 font-bold">
          Your vehicle
        </p>
        <p className="text-2xl font-bold text-white mt-1 leading-tight">
          {v.make} {v.model}
        </p>

        {/* Vehicle card */}
        <div className="mt-5 flex items-center gap-3">
          <div className="h-16 w-16 rounded-2xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center shrink-0">
            <Truck className="h-9 w-9 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />
            <div className="flex items-center gap-1.5 mt-2">
              <Gauge className="h-3.5 w-3.5 text-white/80" />
              <p className="text-xs text-white/90 font-plate font-semibold">
                {v.current_odometer_km.toLocaleString()} km
              </p>
            </div>
          </div>
        </div>

        {assignedCount > 1 && (
          <p className="mt-3 text-xs text-white/85">
            You have {assignedCount} vehicles assigned · pick one when you start a trip
          </p>
        )}

        {/* Start trip CTA */}
        <Link
          href="/trip/start"
          className="mt-6 flex items-center justify-center gap-2 h-14 rounded-2xl bg-white text-orange-600 font-bold text-base w-full shadow-xl shadow-black/10 active:scale-[0.98] transition-transform"
        >
          <Play className="h-5 w-5" fill="currentColor" />
          Start trip
        </Link>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  tone,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "orange" | "amber" | "rose" | "sky" | "violet";
  title: string;
  subtitle: string;
}) {
  const t = {
    emerald: { hover: "hover:border-emerald-300", glow: "bg-emerald-500/10", tile: "bg-emerald-50 ring-emerald-100", icon: "text-emerald-600" },
    orange: { hover: "hover:border-orange-300", glow: "bg-orange-500/10", tile: "bg-orange-50 ring-orange-100", icon: "text-orange-600" },
    amber: { hover: "hover:border-amber-300", glow: "bg-amber-500/10", tile: "bg-amber-50 ring-amber-100", icon: "text-amber-600" },
    rose: { hover: "hover:border-rose-300", glow: "bg-rose-500/10", tile: "bg-rose-50 ring-rose-100", icon: "text-rose-600" },
    sky: { hover: "hover:border-sky-300", glow: "bg-sky-500/10", tile: "bg-sky-50 ring-sky-100", icon: "text-sky-600" },
    violet: { hover: "hover:border-violet-300", glow: "bg-violet-500/10", tile: "bg-violet-50 ring-violet-100", icon: "text-violet-600" },
  }[tone];
  return (
    <Link
      href={href}
      className={`group relative rounded-3xl bg-white border border-ink-200/70 p-4 ${t.hover} active:scale-[0.98] transition-all overflow-hidden`}
    >
      <div className={`absolute -top-6 -right-6 h-20 w-20 rounded-full ${t.glow} blur-xl`} />
      <div className="relative">
        <div className={`h-12 w-12 rounded-2xl ${t.tile} ring-1 flex items-center justify-center mb-3`}>
          <Icon className={`h-6 w-6 ${t.icon}`} />
        </div>
        <p className="text-sm font-bold text-ink-900">{title}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">{subtitle}</p>
      </div>
    </Link>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "sky" | "violet";
}) {
  const t = {
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  }[tone];
  return (
    <div className="rounded-3xl bg-white border border-ink-200/70 p-4">
      <div className={`h-10 w-10 rounded-2xl ${t.bg} ring-1 ${t.ring} flex items-center justify-center mb-3`}>
        <Icon className={`h-5 w-5 ${t.text}`} />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-xl font-bold text-ink-900 tabular mt-1 font-plate">{value}</p>
    </div>
  );
}
