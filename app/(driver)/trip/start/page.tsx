import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StartTripPicker, type AssignedVehicle } from "@/components/driver/StartTripPicker";

export const dynamic = "force-dynamic";

export default async function DriverStartTripPage() {
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
          <p className="text-sm text-amber-700">
            Your driver profile is not set up yet. Please contact your fleet manager.
          </p>
        </div>
      </div>
    );
  }

  // Fetch all currently-assigned vehicles + subsidiaries
  const [{ data: assignments }, { data: subs }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicles(id, plate_number, plate_country, make, model, current_odometer_km, default_subsidiary_id)")
      .eq("driver_id", driver.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .returns<{ vehicles: AssignedVehicle | null }[]>(),
    // Drivers can't read app.subsidiaries directly (RLS); use the safe RPC.
    supabase.schema("app").rpc("fn_subsidiary_options"),
  ]);

  const subsidiaryOptions = (Array.isArray(subs) ? subs : []) as { id: string; name: string }[];

  const vehicles = (assignments ?? [])
    .map((a) => a.vehicles)
    .filter((v): v is AssignedVehicle => v != null);

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-ink-900">Start trip</h1>
      </header>

      {vehicles.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">No vehicle assigned. Speak to your fleet manager.</p>
        </div>
      ) : (
        <StartTripPicker vehicles={vehicles} driverId={driver.id} subsidiaries={subsidiaryOptions} />
      )}
    </div>
  );
}
