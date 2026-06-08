import Link from "next/link";
import { ArrowLeft, Truck, Gauge, ChevronRight, ClipboardCheck } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { VehicleChecklist } from "@/components/driver/VehicleChecklist";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
  requires_photo: boolean;
}

interface AssignedVehicle {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
}

export default async function DriverChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const sp = await searchParams;
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  // A driver may hold several vehicles at once (e.g. Blessing) — never single().
  const { data: assignments } = await supabase
    .schema("app")
    .from("vehicle_assignments")
    .select("vehicles(id, plate_number, plate_country, make, model, current_odometer_km)")
    .eq("driver_id", driver?.id ?? "")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .returns<{ vehicles: AssignedVehicle | null }[]>();

  const vehicles = (assignments ?? [])
    .map((a) => a.vehicles)
    .filter((v): v is AssignedVehicle => v != null);

  if (!driver || vehicles.length === 0) {
    return (
      <div className="p-4 pt-6 space-y-5">
        <BackLink />
        <div className="rounded-3xl bg-gradient-to-br from-ink-100 to-ink-50 border border-ink-200 p-6">
          <p className="text-lg font-bold text-ink-900">No vehicle assigned</p>
          <p className="text-sm text-ink-500 mt-1">
            You need an assigned vehicle before you can complete a checklist.
          </p>
        </div>
      </div>
    );
  }

  // Resolve which vehicle to inspect: explicit choice, or the only one.
  const selected =
    vehicles.find((v) => v.id === sp.vehicle) ??
    (vehicles.length === 1 ? vehicles[0] : null);

  // Picker — more than one vehicle and none chosen yet
  if (!selected) {
    return (
      <div className="p-4 pt-6 space-y-5">
        <BackLink />
        <header>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
            Vehicle checklist
          </p>
          <h1 className="text-2xl font-bold text-ink-900 mt-1">Pick a vehicle</h1>
          <p className="text-sm text-ink-500 mt-1">
            You hold {vehicles.length} vehicles — choose which one to inspect.
          </p>
        </header>
        <div className="space-y-2">
          {vehicles.map((v) => (
            <Link
              key={v.id}
              href={`/checklist?vehicle=${v.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-ink-200/70 hover:border-orange-200 active:scale-[0.99] transition-all"
            >
              <div className="h-11 w-11 rounded-xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />
                <p className="text-xs text-ink-500 mt-1 truncate">
                  {v.make} {v.model}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Resolve the template for the selected vehicle's class
  const { data: templateIdResult } = await supabase
    .schema("app")
    .rpc("fn_template_for_vehicle", { p_vehicle_id: selected.id });
  const templateId = templateIdResult as string | null;

  if (!templateId) {
    return (
      <div className="p-4 pt-6 space-y-5">
        <BackLink />
        <p className="text-sm text-rose-600">
          No checklist template available for this vehicle.
        </p>
      </div>
    );
  }

  const [{ data: template }, { data: items }] = await Promise.all([
    supabase
      .schema("app")
      .from("inspection_templates")
      .select("id, name")
      .eq("id", templateId)
      .single<{ id: string; name: string }>(),
    supabase
      .schema("app")
      .from("inspection_checklist_items")
      .select("id, sort_order, category, label, is_critical, requires_photo")
      .eq("template_id", templateId)
      .order("sort_order")
      .returns<ChecklistItem[]>(),
  ]);

  return (
    <div className="p-4 pt-6 space-y-5">
      <BackLink />

      <header>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 border border-orange-100 mb-2">
          <ClipboardCheck className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-orange-700 font-bold">
            Vehicle checklist
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ink-900">
          {selected.make} {selected.model}
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <PlateBadge plate={selected.plate_number} country={selected.plate_country} size="sm" />
          <span className="inline-flex items-center gap-1 text-xs text-ink-500 font-plate">
            <Gauge className="h-3.5 w-3.5" />
            {selected.current_odometer_km.toLocaleString()} km
          </span>
        </div>
        {vehicles.length > 1 && (
          <Link href="/checklist" className="inline-block mt-2 text-xs font-bold text-orange-600">
            Switch vehicle
          </Link>
        )}
      </header>

      <VehicleChecklist
        vehicleId={selected.id}
        templateId={templateId}
        templateName={template?.name ?? "Checklist"}
        items={items ?? []}
        currentOdometer={selected.current_odometer_km}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/home"
      className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
    >
      <ArrowLeft className="h-4 w-4" /> Home
    </Link>
  );
}
