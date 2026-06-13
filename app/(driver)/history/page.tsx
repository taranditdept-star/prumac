import Link from "next/link";
import { ChevronRight, Clock, Gauge, Activity, MapPin } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { TripStatusBadge } from "@/components/primitives/TripStatusBadge";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface HistoryTrip {
  id: string;
  status: TripStatus;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  completed_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(iso: string | null): string {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function dayLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default async function DriverHistoryPage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  const LIST_LIMIT = 500;
  let trips: HistoryTrip[] = [];
  // Set the stat tiles are computed from. The displayed list already carries
  // every column the stats need (status, odometers, started_at), so for the
  // overwhelming majority of drivers (≤ LIST_LIMIT trips) it IS the full set —
  // no second query. Only when the list is truncated do we fetch a lightweight
  // full set so the tiles stay accurate.
  let statTrips: { status: string; start_odometer_km: number | null; end_odometer_km: number | null; started_at: string | null }[] = [];
  if (driver) {
    const { data } = await supabase
      .schema("app")
      .from("trips")
      .select(
        "id, status, route_description, origin_label, destination_label, start_odometer_km, end_odometer_km, started_at, completed_at, vehicles(plate_number, plate_country, make, model)",
      )
      .eq("driver_id", driver.id)
      .neq("status", "planned")
      .order("started_at", { ascending: false })
      .limit(LIST_LIMIT)
      .returns<HistoryTrip[]>();
    trips = data ?? [];

    if (trips.length < LIST_LIMIT) {
      statTrips = trips;
    } else {
      const { data: stat } = await supabase
        .schema("app")
        .from("trips")
        .select("status, start_odometer_km, end_odometer_km, started_at")
        .eq("driver_id", driver.id)
        .neq("status", "planned")
        .limit(20000);
      statTrips = (stat ?? trips) as typeof statTrips;
    }
  }

  const completed = statTrips.filter((t) => t.status === "completed");
  const totalKm = completed.reduce(
    (s, t) => s + Math.max(0, (t.end_odometer_km ?? 0) - (t.start_odometer_km ?? 0)),
    0,
  );
  const now = new Date();
  const thisMonth = statTrips.filter((t) => {
    if (!t.started_at) return false;
    const d = new Date(t.started_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // Group trips by month for readability.
  const groups: { key: string; trips: HistoryTrip[] }[] = [];
  for (const t of trips) {
    const key = monthKey(t.started_at);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, trips: [] };
      groups.push(g);
    }
    g.trips.push(t);
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900">Trip history</h1>
        <p className="text-sm text-ink-500 mt-0.5">Every trip you've driven</p>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        <MiniStat icon={Activity} label="Trips" value={completed.length.toString()} tone="sky" />
        <MiniStat icon={Gauge} label="Total km" value={totalKm.toLocaleString()} tone="violet" />
        <MiniStat icon={Clock} label="This month" value={thisMonth.toString()} tone="emerald" />
      </section>

      {trips.length === 0 ? (
        <div className="rounded-3xl bg-white border border-ink-200/70 py-12 text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
            <Clock className="h-5 w-5 text-ink-400" />
          </div>
          <p className="text-sm text-ink-700 font-semibold">No trips yet</p>
          <p className="text-[11px] text-ink-500 mt-0.5">Your completed trips will appear here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-2 px-1">{g.key}</p>
              <div className="space-y-2">
                {g.trips.map((t) => {
                  const distance =
                    t.start_odometer_km != null && t.end_odometer_km != null
                      ? Math.max(0, t.end_odometer_km - t.start_odometer_km)
                      : null;
                  const title =
                    t.route_description ||
                    (t.origin_label && t.destination_label
                      ? `${t.origin_label} → ${t.destination_label}`
                      : "Trip");
                  return (
                    <Link
                      key={t.id}
                      href={`/trip/${t.id}`}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-ink-200/70 active:scale-[0.99] transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-ink-900 truncate">{title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {t.vehicles && (
                            <PlateBadge plate={t.vehicles.plate_number} country={t.vehicles.plate_country} size="sm" />
                          )}
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                            <MapPin className="h-3 w-3" />
                            {dayLabel(t.started_at)}
                          </span>
                          {distance != null && (
                            <span className="text-[11px] text-ink-500 font-plate">{distance.toLocaleString()} km</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <TripStatusBadge status={t.status} />
                        <ChevronRight className="h-4 w-4 text-ink-300" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
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
  tone: "sky" | "violet" | "emerald";
}) {
  const t = {
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100" },
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-3 text-center">
      <div className={`h-9 w-9 mx-auto rounded-xl ${t.bg} ring-1 ${t.ring} flex items-center justify-center mb-2`}>
        <Icon className={`h-4 w-4 ${t.text}`} />
      </div>
      <p className="text-lg font-bold text-ink-900 tabular font-plate leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.12em] text-ink-400 font-bold mt-1">{label}</p>
    </div>
  );
}
