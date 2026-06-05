import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { InspectionChecklist } from "@/components/driver/InspectionChecklist";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
  requires_photo: boolean;
}

export default async function DriverInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ type?: "pre_trip" | "post_trip" }>;
}) {
  const { tripId } = await params;
  const sp = await searchParams;
  const type: "pre_trip" | "post_trip" = sp.type === "post_trip" ? "post_trip" : "pre_trip";

  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: trip } = await supabase
    .schema("app")
    .from("trips")
    .select(`
      id, status, vehicle_id,
      vehicles(id, plate_number, plate_country, make, model, current_odometer_km, class),
      drivers(profile_id)
    `)
    .eq("id", tripId)
    .maybeSingle<{
      id: string;
      status: TripStatus;
      vehicle_id: string;
      vehicles: {
        id: string;
        plate_number: string;
        plate_country: CountryCode;
        make: string;
        model: string;
        current_odometer_km: number;
        class: string;
      } | null;
      drivers: { profile_id: string } | null;
    }>();

  if (!trip) notFound();
  if (trip.drivers?.profile_id !== profile.id) notFound();

  // Resolve the template for this vehicle's class
  const { data: templateIdResult } = await supabase
    .schema("app")
    .rpc("fn_template_for_vehicle", { p_vehicle_id: trip.vehicle_id });
  const templateId = templateIdResult as string | null;

  if (!templateId || !trip.vehicles) {
    return (
      <div className="p-4 pt-6">
        <Link href={`/trip/${tripId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-500">
          <ArrowLeft className="h-4 w-4" /> Trip
        </Link>
        <p className="mt-6 text-sm text-rose-600">
          No inspection template available for this vehicle.
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
      <Link href={`/trip/${tripId}`} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to trip
      </Link>

      <header>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
          {type === "pre_trip" ? "Pre-trip inspection" : "Post-trip inspection"}
        </p>
        <h1 className="text-2xl font-bold text-ink-900 mt-1">
          {trip.vehicles.make} {trip.vehicles.model}
        </h1>
        <div className="mt-2">
          <PlateBadge
            plate={trip.vehicles.plate_number}
            country={trip.vehicles.plate_country}
            size="sm"
          />
        </div>
      </header>

      <InspectionChecklist
        tripId={tripId}
        templateId={templateId}
        templateName={template?.name ?? "Inspection"}
        type={type}
        items={items ?? []}
        currentOdometer={trip.vehicles.current_odometer_km}
      />
    </div>
  );
}
