import Link from "next/link";
import { ArrowLeft, ClipboardList, Download } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { MileageLogForm, type VehicleOpt, type DriverOpt } from "@/components/ops/MileageLogForm";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function LogMileagePage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: vehicles }, { data: assigns }, { data: allDrivers }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, plate_country, make, model, current_odometer_km, is_pool")
      .neq("status", "decommissioned")
      .order("plate_number")
      .returns<{ id: string; plate_number: string; plate_country: CountryCode; make: string; model: string; current_odometer_km: number | null; is_pool: boolean }[]>(),
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicle_id, driver_id")
      .is("ended_at", null)
      .returns<{ vehicle_id: string; driver_id: string }[]>(),
    // Full active-driver list for the "who drove?" picker (any driver can take a pool car).
    supabase
      .schema("app")
      .from("drivers")
      .select("id, is_active, profiles!inner(full_name)")
      .eq("is_active", true)
      .returns<{ id: string; is_active: boolean; profiles: { full_name: string | null } | null }[]>(),
  ]);

  const drivers: DriverOpt[] = (allDrivers ?? [])
    .map((d) => ({ id: d.id, name: d.profiles?.full_name ?? "Unnamed driver" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameById = new Map(drivers.map((d) => [d.id, d.name]));

  // The assigned (owner) driver per vehicle — used to pre-fill the picker.
  const ownerByVehicle = new Map<string, string>();
  for (const a of assigns ?? []) if (!ownerByVehicle.has(a.vehicle_id)) ownerByVehicle.set(a.vehicle_id, a.driver_id);

  const options: VehicleOpt[] = (vehicles ?? []).map((v) => {
    const ownerId = ownerByVehicle.get(v.id) ?? null;
    return {
      id: v.id,
      plate: v.plate_number,
      country: v.plate_country,
      make: v.make,
      model: v.model,
      odometer: v.current_odometer_km ?? 0,
      isPool: v.is_pool,
      ownerId,
      ownerName: ownerId ? nameById.get(ownerId) ?? null : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/trips" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to trips
      </Link>

      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ClipboardList className="h-6 w-6 text-orange-400" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-white">Log mileage</h1>
              <p className="text-sm text-slate-300">Record a completed trip — pick the vehicle &amp; driver, enter start &amp; end readings.</p>
            </div>
          </div>
          <Link
            href="/trips"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur hover:bg-white/15"
          >
            <Download className="h-4 w-4" /> View / export trips
          </Link>
        </div>
      </div>

      <MileageLogForm vehicles={options} drivers={drivers} />
    </div>
  );
}
