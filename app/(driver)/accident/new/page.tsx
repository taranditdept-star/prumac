import Link from "next/link";
import { ArrowLeft, AlertCircle, AlertOctagon } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { AccidentReportForm } from "@/components/driver/AccidentReportForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function DriverNewAccidentPage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  if (!driver) {
    return (
      <div className="p-4 pt-8">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">Driver profile not set up.</p>
        </div>
      </div>
    );
  }

  const [{ data: assignment }, { data: activeTrip }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicles(id, plate_number, plate_country, make, model, current_odometer_km)")
      .eq("driver_id", driver.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        vehicles: {
          id: string;
          plate_number: string;
          plate_country: CountryCode;
          make: string;
          model: string;
          current_odometer_km: number;
        } | null;
      }>(),
    supabase
      .schema("app")
      .from("trips")
      .select("id")
      .eq("driver_id", driver.id)
      .in("status", ["in_progress", "paused"])
      .maybeSingle<{ id: string }>(),
  ]);

  const vehicle = assignment?.vehicles;
  if (!vehicle) {
    return (
      <div className="p-4 pt-8 space-y-4">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">No vehicle assigned.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-rose-500 via-rose-600 to-rose-700 text-white p-5 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <AlertOctagon className="h-6 w-6 text-rose-100 mb-2" />
        <h1 className="text-2xl font-bold leading-tight">Report an accident</h1>
        <p className="text-sm text-rose-100 mt-1">
          Are you safe? If anyone is injured, call emergency services first.
        </p>
      </div>

      <div className="rounded-2xl bg-white border border-ink-200/70 p-4 flex items-center gap-3">
        <PlateBadge plate={vehicle.plate_number} country={vehicle.plate_country} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-ink-900">
            {vehicle.make} {vehicle.model}
          </p>
          <p className="text-xs text-ink-500 font-plate">
            {vehicle.current_odometer_km.toLocaleString()} km
          </p>
        </div>
      </div>

      <AccidentReportForm vehicle={vehicle} activeTripId={activeTrip?.id ?? null} />
    </div>
  );
}
