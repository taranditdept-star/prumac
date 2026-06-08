import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, MapPin, Clock, Building2, ClipboardCheck, ChevronRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import { TripActions } from "@/components/ops/TripActions";
import { GpsTracker } from "@/components/driver/GpsTracker";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface TripDetail {
  id: string;
  driver_id: string;
  status: TripStatus;
  purpose: string;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  ended_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  subsidiaries: { name: string } | null;
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "—";
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - new Date(start).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: trip } = await supabase
    .schema("app")
    .from("trips")
    .select(`
      id, driver_id, status, purpose, route_description, origin_label, destination_label,
      start_odometer_km, end_odometer_km, started_at, ended_at,
      vehicles(plate_number, plate_country, make, model),
      subsidiaries(name)
    `)
    .eq("id", id)
    .maybeSingle<TripDetail>();

  if (!trip) notFound();

  // Verify this trip belongs to the current driver
  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();
  if (driver?.id !== trip.driver_id) notFound();

  const distance =
    trip.start_odometer_km != null && trip.end_odometer_km != null
      ? trip.end_odometer_km - trip.start_odometer_km
      : null;

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-5 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative">
          <TripStatusBadge status={trip.status} />
          <p className="text-xl font-bold text-white mt-3 leading-tight">
            {trip.route_description ||
              (trip.origin_label && trip.destination_label
                ? `${trip.origin_label} → ${trip.destination_label}`
                : "Trip")}
          </p>
          {trip.vehicles && (
            <div className="mt-3">
              <PlateBadge
                plate={trip.vehicles.plate_number}
                country={trip.vehicles.plate_country}
                size="sm"
              />
              <p className="text-xs text-slate-300 mt-1">
                {trip.vehicles.make} {trip.vehicles.model}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Key facts grid */}
      <div className="grid grid-cols-2 gap-3">
        <FactTile
          icon={Gauge}
          tone="sky"
          label="Start km"
          value={trip.start_odometer_km != null ? trip.start_odometer_km.toLocaleString() : "—"}
        />
        <FactTile
          icon={Gauge}
          tone={trip.end_odometer_km ? "violet" : "ink"}
          label="End km"
          value={trip.end_odometer_km != null ? trip.end_odometer_km.toLocaleString() : "—"}
        />
        <FactTile
          icon={MapPin}
          tone={distance != null ? "emerald" : "ink"}
          label="Distance"
          value={distance != null ? `${distance.toLocaleString()} km` : "—"}
        />
        <FactTile
          icon={Clock}
          tone="amber"
          label="Duration"
          value={duration(trip.started_at, trip.ended_at)}
        />
      </div>

      {trip.subsidiaries && (
        <div className="rounded-2xl bg-white border border-ink-200/70 p-4 flex items-center gap-3">
          <Building2 className="h-4 w-4 text-violet-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Bill to</p>
            <p className="text-sm font-semibold text-ink-900">{trip.subsidiaries.name}</p>
          </div>
        </div>
      )}

      {/* Inspection CTA — post-trip stays available after the trip auto-completes */}
      {(() => {
        const isPost = trip.status === "ended" || trip.status === "completed";
        return (
          <Link
            href={`/inspection/${trip.id}?type=${isPost ? "post_trip" : "pre_trip"}`}
            className="block rounded-2xl bg-white border border-ink-200/70 p-4 hover:border-orange-300 hover:bg-orange-50/30 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center">
                <ClipboardCheck className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-900">
                  {isPost ? "Post-trip inspection" : "Pre-trip inspection"}
                </p>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  {isPost ? "Record the vehicle's condition after the trip" : "Run the safety checklist before moving"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </div>
          </Link>
        );
      })()}

      {/* GPS tracker */}
      {(trip.status === "in_progress" || trip.status === "paused") && (
        <GpsTracker tripId={trip.id} status={trip.status} />
      )}

      {/* Actions panel */}
      <TripActions
        tripId={trip.id}
        status={trip.status}
        startOdometer={trip.start_odometer_km}
        isManager={false}
      />
    </div>
  );
}

function FactTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "amber" | "emerald" | "violet" | "ink";
  label: string;
  value: string;
}) {
  const toneMap = {
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    ink: "bg-ink-100 text-ink-600 ring-ink-200",
  };
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
      <div className={`h-8 w-8 rounded-lg ring-1 flex items-center justify-center mb-2 ${toneMap[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="mt-1 text-base font-bold text-ink-900 font-plate tabular truncate">{value}</p>
    </div>
  );
}
