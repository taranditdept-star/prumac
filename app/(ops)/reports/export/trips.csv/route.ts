import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { csvDocument } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  status: string;
  purpose: string;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  fuel_litres: number | null;
  fuel_amount: number | null;
  started_at: string | null;
  ended_at: string | null;
  completed_at: string | null;
  vehicles: { plate_number: string; plate_country: string; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
  subsidiaries: { name: string; code: string } | null;
}

export async function GET(request: Request) {
  await requireRole("admin");
  const supabase = await createClient();
  const url = new URL(request.url);
  const limit = Math.min(5000, Number(url.searchParams.get("limit") ?? 1000));

  const { data, error } = await supabase
    .schema("app")
    .from("trips")
    .select(`
      id, status, purpose, route_description, origin_label, destination_label,
      start_odometer_km, end_odometer_km, fuel_litres, fuel_amount,
      started_at, ended_at, completed_at,
      vehicles(plate_number, plate_country, make, model),
      drivers(profiles(full_name)),
      subsidiaries(name, code)
    `)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<Row[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => {
    const distance =
      r.start_odometer_km != null && r.end_odometer_km != null
        ? r.end_odometer_km - r.start_odometer_km
        : "";
    return [
      r.id,
      r.status,
      r.purpose,
      r.vehicles?.plate_country ?? "",
      r.vehicles?.plate_number ?? "",
      r.vehicles ? `${r.vehicles.make} ${r.vehicles.model}` : "",
      r.drivers?.profiles?.full_name ?? "",
      r.subsidiaries?.code ?? "",
      r.subsidiaries?.name ?? "",
      r.route_description ?? "",
      r.origin_label ?? "",
      r.destination_label ?? "",
      r.start_odometer_km ?? "",
      r.end_odometer_km ?? "",
      distance,
      r.fuel_litres ?? "",
      r.fuel_amount ?? "",
      r.started_at ?? "",
      r.ended_at ?? "",
      r.completed_at ?? "",
    ];
  });

  const body = csvDocument(
    [
      "trip_id", "status", "purpose",
      "country", "plate", "vehicle",
      "driver", "subsidiary_code", "subsidiary_name",
      "route", "origin", "destination",
      "start_odometer_km", "end_odometer_km", "distance_km",
      "fuel_litres", "fuel_amount",
      "started_at", "ended_at", "completed_at",
    ],
    rows,
  );

  const filename = `prumac-trips-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
