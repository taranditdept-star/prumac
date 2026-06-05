import Link from "next/link";
import { ArrowLeft, Sparkles, Truck, Users, Building2, MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TripStartForm } from "@/components/ops/TripStartForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [
    { data: vehicles },
    { data: assignments },
    { data: drivers },
    { data: subs },
    { data: openTrips },
  ] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model, current_odometer_km, default_subsidiary_id, status")
      .in("status", ["available", "maintenance"])
      .order("plate_number")
      .returns<
        {
          id: string;
          plate_number: string;
          plate_country: CountryCode;
          make: string;
          model: string;
          current_odometer_km: number;
          default_subsidiary_id: string | null;
          status: string;
        }[]
      >(),
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicle_id, driver_id")
      .is("ended_at", null)
      .returns<{ vehicle_id: string; driver_id: string }[]>(),
    supabase
      .schema("app")
      .from("drivers")
      .select("id, profiles!inner(full_name)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .returns<{ id: string; profiles: { full_name: string | null } | null }[]>(),
    supabase
      .schema("app")
      .from("subsidiaries")
      .select("id, name")
      .order("name")
      .returns<{ id: string; name: string }[]>(),
    supabase
      .schema("app")
      .from("trips")
      .select("id, vehicle_id, driver_id")
      .in("status", ["in_progress", "paused", "ended"])
      .returns<{ id: string; vehicle_id: string; driver_id: string }[]>(),
  ]);

  const assignMap = new Map((assignments ?? []).map((a) => [a.vehicle_id, a.driver_id]));
  const busyVehicles = new Set((openTrips ?? []).map((t) => t.vehicle_id));
  const busyDrivers = new Set((openTrips ?? []).map((t) => t.driver_id));

  const vehiclesWithDriver = (vehicles ?? [])
    .filter((v) => !busyVehicles.has(v.id))
    .map((v) => ({ ...v, driver_id: assignMap.get(v.id) ?? null }));

  const drvList = (drivers ?? [])
    .filter((d) => !busyDrivers.has(d.id))
    .map((d) => ({
      id: d.id,
      full_name: d.profiles?.full_name ?? "Unknown driver",
      vehicle_id: null,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/trips"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to trips
      </Link>

      {/* Hero header */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-8 py-7 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 mb-3 border border-white/10">
            <Sparkles className="h-3 w-3 text-orange-400" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-white font-bold">
              New trip
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            Dispatch a vehicle
          </h1>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl">
            Pick a vehicle, confirm the driver and subsidiary, capture the starting odometer.
            The vehicle is locked to this trip until it&apos;s completed or cancelled.
          </p>
        </div>
      </div>

      {/* Two-column layout: form (8) + summary (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <TripStartForm
            vehicles={vehiclesWithDriver}
            drivers={drvList}
            subsidiaries={subs ?? []}
          />
        </div>

        {/* Side: availability + tips */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h3 className="text-sm font-bold text-ink-900 mb-4">Availability right now</h3>
            <div className="space-y-3">
              <AvailRow
                icon={Truck}
                tone="brand"
                label="Vehicles ready"
                value={vehiclesWithDriver.length}
                hint={
                  busyVehicles.size > 0
                    ? `${busyVehicles.size} on open trips`
                    : "All vehicles free"
                }
              />
              <AvailRow
                icon={Users}
                tone="sky"
                label="Drivers free"
                value={drvList.length}
                hint={
                  busyDrivers.size > 0
                    ? `${busyDrivers.size} on open trips`
                    : "All drivers free"
                }
              />
              <AvailRow
                icon={Building2}
                tone="violet"
                label="Subsidiaries"
                value={(subs ?? []).length}
                hint="billing destinations"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 text-white p-5 shadow-lg shadow-orange-500/30 overflow-hidden relative">
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <MapPin className="h-5 w-5 text-orange-100 mb-3" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-orange-100 font-bold">
              Tip
            </p>
            <p className="text-sm font-semibold mt-1 leading-snug">
              Selecting a vehicle auto-fills its assigned driver, default subsidiary and last odometer reading.
            </p>
            <p className="text-xs text-orange-100/80 mt-3 leading-relaxed">
              You can override any of these if today&apos;s trip differs from the standard assignment.
            </p>
          </div>

          <div className="rounded-2xl border border-ink-200/70 p-5 bg-white">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
              State machine
            </p>
            <p className="text-xs text-ink-600 mt-2 leading-relaxed">
              Trip starts in <span className="font-semibold text-sky-600">in progress</span> →
              can be <span className="font-semibold text-amber-600">paused</span> →
              ends in <span className="font-semibold text-violet-600">ended</span> →
              manager marks it <span className="font-semibold text-emerald-600">completed</span>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AvailRow({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "sky" | "violet";
  label: string;
  value: number;
  hint: string;
}) {
  const t = {
    brand: { bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100" },
    sky: { bg: "bg-sky-50", text: "text-sky-600", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-600", ring: "ring-violet-100" },
  }[tone];
  return (
    <div className="flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl ${t.bg} ${t.text} ring-1 ${t.ring} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
          <p className={`text-xl font-bold tabular ${t.text}`}>{value}</p>
        </div>
        <p className="text-[11px] text-ink-500 mt-0.5">{hint}</p>
      </div>
    </div>
  );
}
