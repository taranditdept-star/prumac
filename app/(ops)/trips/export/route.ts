import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import type { CountryCode, TripStatus } from "@/types/domain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPORT_LIMIT = 50_000;

interface ExportRow {
  status: TripStatus;
  purpose: string | null;
  route_description: string | null;
  origin_label: string | null;
  destination_label: string | null;
  start_odometer_km: number | null;
  end_odometer_km: number | null;
  started_at: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
  subsidiaries: { name: string } | null;
}

/** Turn a `period` param (YYYY or YYYY-MM) into a [start,end) date window. */
function rangeForPeriod(period: string): { start: string; end: string } | null {
  if (/^\d{4}$/.test(period)) return { start: `${period}-01-01`, end: `${Number(period) + 1}-01-01` };
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { start: `${period}-01`, end };
  }
  return null;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const PURPOSE_LABELS: Record<string, string> = {
  delivery: "Delivery",
  sales: "Sales",
  collection: "Collection",
  maintenance_run: "Maintenance run",
  admin: "Admin",
  personal: "Personal",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  paused: "Paused",
  ended: "Awaiting completion",
  completed: "Completed",
  cancelled: "Cancelled",
};

export async function GET(request: NextRequest) {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const sp = request.nextUrl.searchParams;
  const period = sp.get("period") ?? "all";
  const fromRaw = sp.get("from") ?? "";
  const toRaw = sp.get("to") ?? "";
  const vehicleId = sp.get("vehicle") && sp.get("vehicle") !== "all" ? sp.get("vehicle") : null;
  const statusFilter = sp.get("status") && sp.get("status") !== "all" ? sp.get("status") : null;
  const qText = (sp.get("q") ?? "").trim();

  // A custom from/to range wins over the named period. `to` is inclusive, so
  // push the upper bound to the next day for the exclusive `lt`.
  let range: { start: string; end: string } | null = null;
  let rangeLabel = "all-time";
  if (isDate(fromRaw) || isDate(toRaw)) {
    const start = isDate(fromRaw) ? fromRaw : "2000-01-01";
    let end = "2999-01-01";
    if (isDate(toRaw)) {
      const t = new Date(`${toRaw}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() + 1);
      end = t.toISOString().slice(0, 10);
    }
    range = { start, end };
    rangeLabel = `${isDate(fromRaw) ? fromRaw : "start"}_to_${isDate(toRaw) ? toRaw : "now"}`;
  } else {
    const r = rangeForPeriod(period);
    if (r) {
      range = r;
      rangeLabel = period;
    }
  }

  let q = supabase
    .schema("app")
    .from("trips")
    .select(`
      status, purpose, route_description, origin_label, destination_label,
      start_odometer_km, end_odometer_km, started_at,
      vehicles(plate_number, plate_country, make, model),
      drivers(profiles(full_name)),
      subsidiaries(name)
    `);
  if (range) q = q.gte("started_at", range.start).lt("started_at", range.end);
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  if (statusFilter) q = q.eq("status", statusFilter);
  if (qText) q = q.ilike("route_description", `%${qText}%`);
  q = q
    .order("started_at", { ascending: true, nullsFirst: false })
    .limit(EXPORT_LIMIT);

  const { data, error } = await q.returns<ExportRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((t) => {
    const distance =
      t.start_odometer_km != null && t.end_odometer_km != null
        ? t.end_odometer_km - t.start_odometer_km
        : null;
    return {
      Date: fmtDate(t.started_at),
      Country: t.vehicles?.plate_country ?? "",
      Plate: t.vehicles?.plate_number ?? "",
      Vehicle: t.vehicles ? `${t.vehicles.make} ${t.vehicles.model}` : "",
      Driver: t.drivers?.profiles?.full_name ?? "",
      Subsidiary: t.subsidiaries?.name ?? "",
      Purpose: t.purpose ? PURPOSE_LABELS[t.purpose] ?? t.purpose : "",
      From: t.origin_label ?? "",
      To: t.destination_label ?? "",
      "Reason / route": t.route_description ?? "",
      "Start km": t.start_odometer_km ?? "",
      "End km": t.end_odometer_km ?? "",
      "Distance km": distance ?? "",
      Status: STATUS_LABELS[t.status] ?? t.status,
    };
  });

  const totalKm = rows.reduce((s, r) => s + (typeof r["Distance km"] === "number" ? r["Distance km"] : 0), 0);

  // Header + data, then a spacer + totals row.
  const header = [
    "Date", "Country", "Plate", "Vehicle", "Driver", "Subsidiary", "Purpose",
    "From", "To", "Reason / route", "Start km", "End km", "Distance km", "Status",
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  if (rows.length) {
    XLSX.utils.sheet_add_aoa(
      ws,
      [[], ["", "", "", "", "", "", "", "", "", "", "", "TOTAL", totalKm, `${rows.length} trips`]],
      { origin: -1 },
    );
  }
  ws["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 15 },
    { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mileage");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `prumac-mileage-${rangeLabel}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
