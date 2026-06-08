import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RepairClaimForm, type RepairVehicle } from "@/components/driver/RepairClaimForm";

export const dynamic = "force-dynamic";

export default async function NewRepairClaimPage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  const [{ data: assignments }, { data: subs }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicles(id, plate_number, plate_country, make, model, current_odometer_km, default_subsidiary_id)")
      .eq("driver_id", driver?.id ?? "")
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .returns<{ vehicles: RepairVehicle | null }[]>(),
    supabase.schema("app").rpc("fn_subsidiary_options"),
  ]);

  const subsidiaries = (Array.isArray(subs) ? subs : []) as { id: string; name: string }[];
  const vehicles = (assignments ?? [])
    .map((a) => a.vehicles)
    .filter((v): v is RepairVehicle => v != null);

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
          Repair claim
        </p>
        <h1 className="text-2xl font-bold text-ink-900 mt-1">Log a repair expense</h1>
        <p className="text-sm text-ink-500 mt-1">
          Photograph the receipt — the accountant reviews and reimburses approved claims.
        </p>
      </header>

      {vehicles.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700">
            You need an assigned vehicle to log a repair. Speak to your fleet manager.
          </p>
        </div>
      ) : (
        <RepairClaimForm vehicles={vehicles} subsidiaries={subsidiaries} />
      )}
    </div>
  );
}
