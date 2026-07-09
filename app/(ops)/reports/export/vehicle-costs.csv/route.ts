import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { csvDocument } from "@/lib/utils/csv";

export const dynamic = "force-dynamic";

interface Row {
  plate_number: string;
  plate_country: string;
  make: string;
  model: string;
  km: number;
  fuel_spend: number;
  maintenance_spend: number;
  operating_cost: number;
  cost_per_km: number | null;
  l_100km: number | null;
}

export async function GET() {
  await requireRole("admin");
  const supabase = await createClient();

  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .schema("app")
    .rpc("fn_vehicle_cost_breakdown", { p_start: periodStart, p_end: periodEnd });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (Array.isArray(data) ? (data as Row[]) : []).map((r) => [
    r.plate_country,
    r.plate_number,
    `${r.make} ${r.model}`,
    r.km,
    r.fuel_spend,
    r.maintenance_spend,
    r.operating_cost,
    r.cost_per_km ?? "",
    r.l_100km ?? "",
  ]);

  const body = csvDocument(
    ["country", "plate", "vehicle", "distance_km", "fuel_spend", "maintenance_spend", "operating_cost", "cost_per_km", "l_per_100km"],
    rows,
  );

  const filename = `prumac-vehicle-costs-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
