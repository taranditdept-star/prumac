import { EXPORT_LIMIT, type ExportDataset } from "./types";
import { purposeText } from "@/lib/trip-purposes";

/**
 * Every list that can be exported. To add another, add one entry here — the
 * route, the Excel writer, the PDF writer and the button all work off this.
 */

const date = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Harare" }) : "";
const datetime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" }) : "";
const title = (v: string | null | undefined): string =>
  v ? v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "";
/** Numbers stay numbers so Excel can total them; nulls become blank, not 0. */
const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

interface AnyRow { [k: string]: any }   // eslint-disable-line @typescript-eslint/no-explicit-any

export const DATASETS: Record<string, ExportDataset<AnyRow>> = {
  vehicles: {
    key: "vehicles",
    title: "Vehicles",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase, params) => {
      let q = supabase.schema("app").from("vehicles")
        .select("*, subsidiaries(name)").order("make").limit(EXPORT_LIMIT);
      const status = params.get("status");
      if (status && status !== "all") q = q.eq("status", status);
      else q = q.neq("status", "decommissioned");
      const { data, error } = await q;
      return { rows: data ?? [], error: error?.message, subtitle: status && status !== "all" ? title(status) : undefined };
    },
    columns: [
      { header: "Plate", value: (r) => r.plate_number, width: 12 },
      { header: "Country", value: (r) => r.plate_country, width: 8 },
      { header: "Make", value: (r) => r.make, width: 14 },
      { header: "Model", value: (r) => r.model, width: 14 },
      { header: "Year", value: (r) => num(r.year), width: 7, numeric: true },
      { header: "Class", value: (r) => title(r.class), width: 12 },
      { header: "Status", value: (r) => title(r.status), width: 13 },
      { header: "Odometer (km)", value: (r) => num(r.current_odometer_km), width: 13, numeric: true },
      { header: "Branch", value: (r) => r.home_branch ?? "", width: 14 },
      { header: "Owner", value: (r) => r.subsidiaries?.name ?? "", width: 18 },
      { header: "Fuel", value: (r) => title(r.fuel_type), width: 10 },
      { header: "VIN", value: (r) => r.vin ?? "", width: 20 },
      { header: "Licence expiry", value: (r) => date(r.licence_expires_at), width: 14 },
      { header: "Insurance expiry", value: (r) => date(r.insurance_expires_at), width: 14 },
    ],
  },

  drivers: {
    key: "drivers",
    title: "Drivers",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase, params) => {
      let q = supabase.schema("app").from("drivers")
        .select("*, profiles!inner(full_name, phone, access_status)")
        .limit(EXPORT_LIMIT);
      if (params.get("active") === "1") q = q.eq("is_active", true);
      const { data, error } = await q;
      const rows = (data ?? []).sort((a: AnyRow, b: AnyRow) =>
        String(a.profiles?.full_name ?? "").localeCompare(String(b.profiles?.full_name ?? "")));
      return { rows, error: error?.message };
    },
    columns: [
      { header: "Driver ID", value: (r) => r.employee_number ?? "", width: 11 },
      { header: "Name", value: (r) => r.profiles?.full_name ?? "", width: 24 },
      { header: "Phone", value: (r) => r.profiles?.phone ?? "", width: 15 },
      { header: "National ID", value: (r) => r.national_id ?? "", width: 16 },
      { header: "Licence no.", value: (r) => r.licence_number ?? "", width: 14 },
      { header: "Country", value: (r) => r.licence_country ?? "", width: 8 },
      { header: "Classes", value: (r) => (r.licence_classes ?? []).join(", "), width: 12 },
      { header: "Licence expiry", value: (r) => date(r.licence_expires_at), width: 14 },
      { header: "Medical expiry", value: (r) => date(r.medical_cert_expires_at), width: 14 },
      { header: "Defensive cert", value: (r) => date(r.defensive_driving_cert_at), width: 14 },
      { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive"), width: 10 },
      { header: "Access", value: (r) => title(r.profiles?.access_status ?? "active"), width: 12 },
      { header: "Next of kin", value: (r) => r.next_of_kin_name ?? "", width: 18 },
      { header: "Kin phone", value: (r) => r.next_of_kin_phone ?? "", width: 14 },
    ],
  },

  trips: {
    key: "trips",
    title: "Trips",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase, params) => {
      let q = supabase.schema("app").from("trips")
        .select(`started_at, ended_at, status, purpose, purpose_detail, route_description,
                 origin_label, destination_label, start_odometer_km, end_odometer_km,
                 fuel_litres, fuel_amount, load_count,
                 vehicles(plate_number, make, model),
                 drivers(employee_number, profiles(full_name)),
                 subsidiaries(name)`)
        .order("started_at", { ascending: false }).limit(EXPORT_LIMIT);
      const status = params.get("status");
      if (status && status !== "all") q = q.eq("status", status);
      const from = params.get("from"), to = params.get("to");
      if (from) q = q.gte("started_at", from);
      if (to) q = q.lte("started_at", `${to}T23:59:59`);
      const { data, error } = await q;
      const sub = [from && `from ${from}`, to && `to ${to}`].filter(Boolean).join(" ");
      return { rows: data ?? [], error: error?.message, subtitle: sub || undefined };
    },
    columns: [
      { header: "Started", value: (r) => datetime(r.started_at), width: 16 },
      { header: "Ended", value: (r) => datetime(r.ended_at), width: 16 },
      { header: "Status", value: (r) => title(r.status), width: 12 },
      { header: "Plate", value: (r) => r.vehicles?.plate_number ?? "", width: 11 },
      { header: "Vehicle", value: (r) => [r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" "), width: 16 },
      { header: "Driver", value: (r) => r.drivers?.profiles?.full_name ?? "", width: 20 },
      { header: "Driver ID", value: (r) => r.drivers?.employee_number ?? "", width: 10 },
      { header: "Billed to", value: (r) => r.subsidiaries?.name ?? "", width: 18 },
      { header: "Purpose", value: (r) => purposeText(r.purpose, r.purpose_detail), width: 26 },
      { header: "Route", value: (r) => r.route_description ?? [r.origin_label, r.destination_label].filter(Boolean).join(" → "), width: 26 },
      { header: "Start km", value: (r) => num(r.start_odometer_km), width: 11, numeric: true },
      { header: "End km", value: (r) => num(r.end_odometer_km), width: 11, numeric: true },
      {
        header: "Distance km", width: 12, numeric: true,
        value: (r) => (r.start_odometer_km != null && r.end_odometer_km != null
          ? Math.round((Number(r.end_odometer_km) - Number(r.start_odometer_km)) * 10) / 10
          : null),
      },
      { header: "Fuel (L)", value: (r) => num(r.fuel_litres), width: 10, numeric: true },
      { header: "Fuel cost", value: (r) => num(r.fuel_amount), width: 11, numeric: true },
      { header: "Loads", value: (r) => num(r.load_count), width: 8, numeric: true },
    ],
  },

  invoices: {
    key: "invoices",
    title: "Invoices",
    roles: ["subsidiary_billing", "admin", "fleet_manager"],
    orientation: "landscape",
    fetch: async (supabase, params) => {
      let q = supabase.schema("app").from("invoices")
        .select(`invoice_number, status, period_start, period_end, issued_at, due_at,
                 subtotal, total_due, amount_paid, balance_outstanding, currency,
                 subsidiaries(name, code)`)
        .order("issued_at", { ascending: false }).limit(EXPORT_LIMIT);
      const status = params.get("status");
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      return { rows: data ?? [], error: error?.message, subtitle: status && status !== "all" ? title(status) : undefined };
    },
    columns: [
      { header: "Invoice no.", value: (r) => r.invoice_number, width: 16 },
      { header: "Customer", value: (r) => r.subsidiaries?.name ?? "", width: 22 },
      { header: "Code", value: (r) => r.subsidiaries?.code ?? "", width: 14 },
      { header: "Status", value: (r) => title(r.status), width: 12 },
      { header: "Period from", value: (r) => date(r.period_start), width: 13 },
      { header: "Period to", value: (r) => date(r.period_end), width: 13 },
      { header: "Issued", value: (r) => date(r.issued_at), width: 13 },
      { header: "Due", value: (r) => date(r.due_at), width: 13 },
      { header: "Currency", value: (r) => r.currency ?? "USD", width: 9 },
      { header: "Subtotal", value: (r) => num(r.subtotal), width: 12, numeric: true },
      { header: "Total due", value: (r) => num(r.total_due), width: 12, numeric: true },
      { header: "Paid", value: (r) => num(r.amount_paid), width: 12, numeric: true },
      { header: "Outstanding", value: (r) => num(r.balance_outstanding), width: 13, numeric: true },
    ],
  },

  faults: {
    key: "faults",
    title: "Faults",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase, params) => {
      let q = supabase.schema("app").from("faults")
        .select(`reported_at, severity, status, category, title, description, odometer_km,
                 vehicles(plate_number, make, model), drivers(profiles(full_name))`)
        .order("reported_at", { ascending: false }).limit(EXPORT_LIMIT);
      const status = params.get("status");
      if (status && status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      return { rows: data ?? [], error: error?.message };
    },
    columns: [
      { header: "Reported", value: (r) => datetime(r.reported_at), width: 16 },
      { header: "Plate", value: (r) => r.vehicles?.plate_number ?? "", width: 11 },
      { header: "Vehicle", value: (r) => [r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" "), width: 16 },
      { header: "Severity", value: (r) => title(r.severity), width: 10 },
      { header: "Status", value: (r) => title(r.status), width: 12 },
      { header: "Category", value: (r) => title(r.category), width: 13 },
      { header: "Title", value: (r) => r.title ?? "", width: 30 },
      { header: "Reported by", value: (r) => r.drivers?.profiles?.full_name ?? "", width: 20 },
      { header: "Odometer km", value: (r) => num(r.odometer_km), width: 12, numeric: true },
    ],
  },

  inspections: {
    key: "inspections",
    title: "Inspections",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase) => {
      const { data, error } = await supabase.schema("app").from("inspections")
        .select(`completed_at, type, overall_result, odometer_km,
                 vehicles(plate_number, make, model), drivers(profiles(full_name))`)
        .order("completed_at", { ascending: false }).limit(EXPORT_LIMIT);
      return { rows: data ?? [], error: error?.message };
    },
    columns: [
      { header: "Completed", value: (r) => datetime(r.completed_at), width: 16 },
      { header: "Plate", value: (r) => r.vehicles?.plate_number ?? "", width: 11 },
      { header: "Vehicle", value: (r) => [r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" "), width: 16 },
      { header: "Type", value: (r) => title(r.type), width: 14 },
      { header: "Result", value: (r) => title(r.overall_result), width: 12 },
      { header: "Driver", value: (r) => r.drivers?.profiles?.full_name ?? "", width: 20 },
      { header: "Odometer km", value: (r) => num(r.odometer_km), width: 12, numeric: true },
    ],
  },

  fuel: {
    key: "fuel",
    title: "Fuel logs",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase) => {
      const { data, error } = await supabase.schema("app").from("fuel_logs")
        .select(`filled_at, litres, cost, odometer_km, station, vehicles(plate_number, make, model)`)
        .order("filled_at", { ascending: false }).limit(EXPORT_LIMIT);
      return { rows: data ?? [], error: error?.message };
    },
    columns: [
      { header: "Date", value: (r) => datetime(r.filled_at), width: 16 },
      { header: "Plate", value: (r) => r.vehicles?.plate_number ?? "", width: 11 },
      { header: "Vehicle", value: (r) => [r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" "), width: 16 },
      { header: "Litres", value: (r) => num(r.litres), width: 10, numeric: true },
      { header: "Cost", value: (r) => num(r.cost), width: 11, numeric: true },
      { header: "Odometer km", value: (r) => num(r.odometer_km), width: 12, numeric: true },
      { header: "Station", value: (r) => r.station ?? "", width: 18 },
    ],
  },

  accidents: {
    key: "accidents",
    title: "Accidents",
    roles: ["fleet_manager", "admin"],
    orientation: "landscape",
    fetch: async (supabase) => {
      const { data, error } = await supabase.schema("app").from("accidents")
        .select(`occurred_at, severity, status, location_description, injuries, odometer_km,
                 vehicles(plate_number, make, model), drivers(profiles(full_name))`)
        .order("occurred_at", { ascending: false }).limit(EXPORT_LIMIT);
      return { rows: data ?? [], error: error?.message };
    },
    columns: [
      { header: "Occurred", value: (r) => datetime(r.occurred_at), width: 16 },
      { header: "Plate", value: (r) => r.vehicles?.plate_number ?? "", width: 11 },
      { header: "Vehicle", value: (r) => [r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(" "), width: 16 },
      { header: "Driver", value: (r) => r.drivers?.profiles?.full_name ?? "", width: 20 },
      { header: "Severity", value: (r) => title(r.severity), width: 11 },
      { header: "Status", value: (r) => title(r.status), width: 12 },
      { header: "Injuries", value: (r) => (r.injuries ? "Yes" : "No"), width: 9 },
      { header: "Location", value: (r) => r.location_description ?? "", width: 30 },
      { header: "Odometer km", value: (r) => num(r.odometer_km), width: 12, numeric: true },
    ],
  },
};

export const DATASET_KEYS = Object.keys(DATASETS);
