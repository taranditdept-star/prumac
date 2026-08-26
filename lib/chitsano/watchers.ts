import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The things Chitsano checks without being asked.
 *
 * Each watcher returns findings; the cron decides what is worth saying out loud
 * (see shouldAnnounce). Watchers never post — that keeps them easy to run and
 * read in isolation, and means a noisy watcher can be muted without touching
 * the detection.
 */

export type Level = "info" | "warn" | "urgent";

export interface Finding {
  watcher: string;
  /** Stable across runs, so the same problem is recognised tomorrow. */
  key: string;
  level: Level;
  summary: string;
}

const app = () => createServiceClient().schema("app");
const money = (n: number) =>
  `USD ${Math.round(n).toLocaleString("en-GB")}`;
const daysBetween = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Expired or soon-to-expire vehicle papers — a stopped truck at a roadblock. */
async function watchDocuments(): Promise<Finding[]> {
  const { data } = await app()
    .from("vehicle_documents")
    .select("id, document_type, expires_at, vehicles(plate_number)")
    .eq("is_active", true)
    .not("expires_at", "is", null)
    .lte("expires_at", new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
    .returns<{ id: string; document_type: string; expires_at: string; vehicles: { plate_number: string } | null }[]>();

  return (data ?? []).map((d) => {
    const overdue = daysBetween(d.expires_at);
    const doc = d.document_type.replaceAll("_", " ");
    const plate = d.vehicles?.plate_number ?? "a vehicle";
    return {
      watcher: "documents",
      key: d.id,
      level: overdue > 0 ? "urgent" : "warn",
      summary:
        overdue > 0
          ? `${plate} — ${doc} expired ${overdue} day${overdue === 1 ? "" : "s"} ago`
          : `${plate} — ${doc} expires in ${Math.abs(overdue)} days`,
    };
  });
}

/** A driver whose licence or medical is about to lapse cannot legally drive. */
async function watchDriverPapers(): Promise<Finding[]> {
  const soon = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await app()
    .from("drivers")
    .select("id, licence_expires_at, medical_cert_expires_at, employee_number, profiles!inner(full_name)")
    .eq("is_active", true)
    .returns<{
      id: string; licence_expires_at: string | null; medical_cert_expires_at: string | null;
      employee_number: string | null; profiles: { full_name: string | null } | null;
    }[]>();

  const out: Finding[] = [];
  for (const d of data ?? []) {
    const who = d.profiles?.full_name ?? d.employee_number ?? "A driver";
    for (const [label, date] of [
      ["licence", d.licence_expires_at],
      ["medical", d.medical_cert_expires_at],
    ] as const) {
      if (!date || date > soon) continue;
      const overdue = daysBetween(date);
      out.push({
        watcher: "driver_papers",
        key: `${d.id}:${label}`,
        level: overdue > 0 ? "urgent" : "warn",
        summary:
          overdue > 0
            ? `${who} — ${label} expired ${overdue} day${overdue === 1 ? "" : "s"} ago`
            : `${who} — ${label} expires in ${Math.abs(overdue)} days`,
      });
    }
  }
  return out;
}

/** Money that has been owed a long time, grouped so it reads as one problem. */
async function watchReceivables(): Promise<Finding[]> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await app()
    .from("invoices")
    .select("subsidiary_id, balance_outstanding, subsidiaries(name)")
    .gt("balance_outstanding", 0)
    .lt("due_at", cutoff)
    .returns<{ subsidiary_id: string; balance_outstanding: number; subsidiaries: { name: string } | null }[]>();

  const byCustomer = new Map<string, { name: string; total: number; count: number }>();
  for (const inv of data ?? []) {
    const row = byCustomer.get(inv.subsidiary_id) ?? {
      name: inv.subsidiaries?.name ?? "Unknown", total: 0, count: 0,
    };
    row.total += Number(inv.balance_outstanding);
    row.count += 1;
    byCustomer.set(inv.subsidiary_id, row);
  }

  return [...byCustomer.entries()]
    .filter(([, r]) => r.total > 0)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([id, r]) => ({
      watcher: "receivables",
      key: id,
      // Re-announced when it crosses into a worse band, not on every run.
      level: r.total >= 100_000 ? "urgent" : "warn",
      summary: `${r.name} owes ${money(r.total)} across ${r.count} invoice${r.count === 1 ? "" : "s"} over 90 days old`,
    }));
}

/** A service that is overdue by kilometres, now that odometers are trustworthy. */
async function watchServiceDue(): Promise<Finding[]> {
  const { data } = await app()
    .from("vehicles")
    .select("id, plate_number, current_odometer_km, last_service_odometer_km, service_interval_km")
    .neq("status", "decommissioned")
    .not("last_service_odometer_km", "is", null)
    .not("service_interval_km", "is", null)
    .returns<{
      id: string; plate_number: string; current_odometer_km: number;
      last_service_odometer_km: number; service_interval_km: number;
    }[]>();

  const out: Finding[] = [];
  for (const v of data ?? []) {
    const since = Number(v.current_odometer_km) - Number(v.last_service_odometer_km);
    const interval = Number(v.service_interval_km);
    if (!Number.isFinite(since) || interval <= 0) continue;
    const over = since - interval;
    // A replaced instrument reads lower than the old one, which would otherwise
    // look like a vehicle that has driven backwards. Ignore rather than alarm.
    if (since < 0) continue;

    // A gap of twenty service intervals is not a late service, it is a wrong
    // number — and "5,942,417 km past its service" is the kind of alert that
    // teaches people to ignore all the others. Report it as what it is.
    if (since > interval * 20) {
      out.push({
        watcher: "odometer_check",
        key: v.id,
        level: "warn",
        summary:
          `${v.plate_number} — the figures do not add up: last serviced at ` +
          `${Math.round(Number(v.last_service_odometer_km)).toLocaleString("en-GB")} km, ` +
          `now reading ${Math.round(Number(v.current_odometer_km)).toLocaleString("en-GB")} km. ` +
          `Check the odometer or the service record before trusting either.`,
      });
      continue;
    }

    if (over >= 0) {
      out.push({
        watcher: "service_due",
        key: v.id,
        level: over >= interval * 0.2 ? "urgent" : "warn",
        summary: `${v.plate_number} is ${Math.round(over).toLocaleString("en-GB")} km past its ${Math.round(interval).toLocaleString("en-GB")} km service`,
      });
    } else if (Math.abs(over) <= 500) {
      out.push({
        watcher: "service_due",
        key: v.id,
        level: "info",
        summary: `${v.plate_number} is due a service in ${Math.round(Math.abs(over))} km`,
      });
    }
  }
  return out;
}

/**
 * Odometer readings that cannot be true.
 *
 * Three vehicles currently read over a million kilometres, one of them 6.6
 * million — that is 165 times round the Earth. It is a typed-in extra digit,
 * and it quietly poisons cost-per-km, service scheduling and trip distances
 * until someone notices.
 */
const IMPLAUSIBLE_KM = 1_500_000;

async function watchOdometerSanity(): Promise<Finding[]> {
  const { data } = await app()
    .from("vehicles")
    .select("id, plate_number, current_odometer_km")
    .neq("status", "decommissioned")
    .gt("current_odometer_km", IMPLAUSIBLE_KM)
    .returns<{ id: string; plate_number: string; current_odometer_km: number }[]>();

  return (data ?? []).map((v) => ({
    watcher: "odometer_check",
    key: `reading:${v.id}`,
    level: "warn" as Level,
    summary:
      `${v.plate_number} reads ${Math.round(Number(v.current_odometer_km)).toLocaleString("en-GB")} km, ` +
      `which cannot be right — it looks like an extra digit. Every cost-per-km figure for this vehicle is wrong until it is corrected.`,
  }));
}

/** Drivers who are not using the app at all — one finding, not twenty-four. */
async function watchDormantDrivers(): Promise<Finding[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [{ data: drivers }, { data: sessions }] = await Promise.all([
    app().from("drivers").select("profile_id").eq("is_active", true)
      .returns<{ profile_id: string }[]>(),
    app().from("login_sessions").select("profile_id").gte("login_at", since)
      .returns<{ profile_id: string }[]>(),
  ]);
  const seen = new Set((sessions ?? []).map((s) => s.profile_id));
  const dormant = (drivers ?? []).filter((d) => !seen.has(d.profile_id)).length;
  if (dormant === 0) return [];

  // Banded, so the alert repeats only when the number moves materially.
  const band = dormant >= 20 ? "20+" : dormant >= 10 ? "10-19" : dormant >= 5 ? "5-9" : "1-4";
  return [{
    watcher: "dormant_drivers",
    key: `band:${band}`,
    level: dormant >= 10 ? "urgent" : "warn",
    summary: `${dormant} active drivers have not opened the app in two weeks`,
  }];
}

/** Completed trips carrying no distance — unbillable and invisible in the costs. */
async function watchMissingMileage(): Promise<Finding[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await app()
    .from("trips")
    .select("id, start_odometer_km, end_odometer_km")
    .eq("status", "completed")
    .gte("started_at", since)
    .returns<{ id: string; start_odometer_km: number | null; end_odometer_km: number | null }[]>();

  const missing = (data ?? []).filter(
    (t) => t.end_odometer_km === null || Number(t.end_odometer_km) === Number(t.start_odometer_km),
  ).length;
  if (missing < 3) return [];

  const band = missing >= 20 ? "20+" : missing >= 10 ? "10-19" : "3-9";
  return [{
    watcher: "missing_mileage",
    key: `band:${band}`,
    level: missing >= 10 ? "warn" : "info",
    summary: `${missing} trips in the last month recorded no distance — they cannot be billed or costed`,
  }];
}

export const WATCHERS: { name: string; run: () => Promise<Finding[]> }[] = [
  { name: "documents", run: watchDocuments },
  { name: "driver_papers", run: watchDriverPapers },
  { name: "receivables", run: watchReceivables },
  { name: "service_due", run: watchServiceDue },
  { name: "odometer_check", run: watchOdometerSanity },
  { name: "dormant_drivers", run: watchDormantDrivers },
  { name: "missing_mileage", run: watchMissingMileage },
];

export async function runAllWatchers(): Promise<Finding[]> {
  const results = await Promise.all(
    WATCHERS.map((w) =>
      w.run().catch((e) => {
        // One broken watcher must not silence the rest.
        console.error(`[chitsano] watcher ${w.name} failed:`, e);
        return [] as Finding[];
      }),
    ),
  );
  return results.flat();
}

/** How long before the same standing problem is worth mentioning again. */
const COOLDOWN_DAYS: Record<Level, number> = { urgent: 7, warn: 14, info: 30 };

export function shouldAnnounce(
  finding: Finding,
  known: { level: string; last_announced_at: string | null } | undefined,
): boolean {
  if (!known) return true;                                  // new
  const worsened =
    (finding.level === "urgent" && known.level !== "urgent") ||
    (finding.level === "warn" && known.level === "info");
  if (worsened) return true;
  if (!known.last_announced_at) return true;
  return daysBetween(known.last_announced_at) >= COOLDOWN_DAYS[finding.level];
}
