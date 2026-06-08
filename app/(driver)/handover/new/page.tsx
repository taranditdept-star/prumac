import Link from "next/link";
import { ArrowLeft, Truck, ChevronRight, ArrowLeftRight } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { HandoverChecklist } from "@/components/driver/HandoverChecklist";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
}

interface AssignedVehicle {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  current_odometer_km: number;
}

export default async function NewHandoverPage({
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
          <p className="text-lg font-bold text-ink-900">No vehicle to hand over</p>
          <p className="text-sm text-ink-500 mt-1">You don't currently hold any vehicle.</p>
        </div>
      </div>
    );
  }

  const selected =
    vehicles.find((v) => v.id === sp.vehicle) ?? (vehicles.length === 1 ? vehicles[0] : null);

  if (!selected) {
    return (
      <div className="p-4 pt-6 space-y-5">
        <BackLink />
        <header>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Handover</p>
          <h1 className="text-2xl font-bold text-ink-900 mt-1">Which vehicle?</h1>
        </header>
        <div className="space-y-2">
          {vehicles.map((v) => (
            <Link
              key={v.id}
              href={`/handover/new?vehicle=${v.id}`}
              className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-ink-200/70 hover:border-orange-200 active:scale-[0.99] transition-all"
            >
              <div className="h-11 w-11 rounded-xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <PlateBadge plate={v.plate_number} country={v.plate_country} size="sm" />
                <p className="text-xs text-ink-500 mt-1 truncate">{v.make} {v.model}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-300" />
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const { data: templateIdResult } = await supabase
    .schema("app")
    .rpc("fn_template_for_vehicle", { p_vehicle_id: selected.id });
  const templateId = templateIdResult as string | null;

  const [{ data: template }, { data: items }, { data: drivers }] = await Promise.all([
    templateId
      ? supabase.schema("app").from("inspection_templates").select("id, name").eq("id", templateId).single<{ id: string; name: string }>()
      : Promise.resolve({ data: null }),
    templateId
      ? supabase.schema("app").from("inspection_checklist_items").select("id, sort_order, category, label, is_critical").eq("template_id", templateId).order("sort_order").returns<ChecklistItem[]>()
      : Promise.resolve({ data: [] as ChecklistItem[] }),
    supabase.schema("app").rpc("fn_driver_options"),
  ]);

  const driverOptions = (Array.isArray(drivers) ? drivers : []) as { id: string; full_name: string | null }[];

  if (!templateId) {
    return (
      <div className="p-4 pt-6 space-y-5">
        <BackLink />
        <p className="text-sm text-rose-600">No checklist template available for this vehicle.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pt-6 space-y-5">
      <BackLink />
      <header>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 border border-orange-100 mb-2">
          <ArrowLeftRight className="h-3.5 w-3.5 text-orange-600" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-orange-700 font-bold">Hand over vehicle</span>
        </div>
        <h1 className="text-2xl font-bold text-ink-900">{selected.make} {selected.model}</h1>
        <div className="mt-2"><PlateBadge plate={selected.plate_number} country={selected.plate_country} size="sm" /></div>
      </header>

      <HandoverChecklist
        mode="initiate"
        vehicleId={selected.id}
        drivers={driverOptions}
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
    <Link href="/handover" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
      <ArrowLeft className="h-4 w-4" /> Handovers
    </Link>
  );
}
