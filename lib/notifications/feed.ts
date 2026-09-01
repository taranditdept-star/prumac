import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * What the bell shows.
 *
 * The bell was decorative on both sides of the app: on the driver header it had
 * no click handler at all, and in the office top bar it was a link to /live —
 * the live map, which is not a notification list. Meanwhile app.alerts already
 * held hundreds of real, unresolved, per-vehicle and per-driver events that
 * nobody was being shown.
 *
 * Read state is the alert's own acknowledged_at, so acknowledging here and
 * acknowledging on the live board are the same act — there is no second,
 * private notion of "read" to drift out of step.
 */

const app = () => createServiceClient().schema("app");

export type Audience = "office" | "driver";

export interface FeedItem {
  id: string;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  body: string | null;
  at: string;
  href: string | null;
  read: boolean;
}

export interface Feed {
  items: FeedItem[];
  unread: number;
}

interface AlertRow {
  id: string;
  kind: string;
  severity: string | null;
  title: string | null;
  body: string | null;
  raised_at: string;
  acknowledged_at: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  trip_id: string | null;
  fault_id: string | null;
  accident_id: string | null;
}

const COLS =
  "id, kind, severity, title, body, raised_at, acknowledged_at, vehicle_id, driver_id, trip_id, fault_id, accident_id";

/** Where tapping the alert should take you — the specific record, if there is one. */
function linkFor(a: AlertRow, audience: Audience): string | null {
  if (audience === "driver") {
    // A driver has no access to the ops screens, so only ever point them at
    // something inside their own app.
    if (a.trip_id) return `/trip/${a.trip_id}`;
    return null;
  }
  if (a.accident_id) return `/accidents/${a.accident_id}`;
  if (a.fault_id) return `/faults/${a.fault_id}`;
  if (a.trip_id) return `/trips/${a.trip_id}`;
  if (a.vehicle_id) return `/vehicles/${a.vehicle_id}`;
  if (a.driver_id) return `/drivers/${a.driver_id}`;
  return "/live";
}

const severityOf = (s: string | null): FeedItem["severity"] =>
  s === "critical" || s === "warning" ? s : "info";

/**
 * The office feed: everything still unresolved, worst and newest first.
 *
 * Capped at LIMIT because a bell is a glance, not a report — the full list
 * lives on /live. The unread COUNT is taken separately with a head query so it
 * stays truthful past the cap.
 */
const LIMIT = 30;

export async function getOfficeFeed(): Promise<Feed> {
  const [{ data }, { count }] = await Promise.all([
    app()
      .from("alerts")
      .select(COLS)
      .is("resolved_at", null)
      .order("raised_at", { ascending: false })
      .limit(LIMIT)
      .returns<AlertRow[]>(),
    app()
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .is("acknowledged_at", null),
  ]);

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  const items = (data ?? [])
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      severity: severityOf(a.severity),
      title: a.title ?? a.kind.replaceAll("_", " "),
      body: a.body,
      at: a.raised_at,
      href: linkFor(a, "office"),
      read: a.acknowledged_at != null,
    }))
    // Unread first, then by severity, then newest — so a critical nobody has
    // looked at cannot be pushed off the list by a stream of resolved noise.
    .sort((x, y) =>
      Number(x.read) - Number(y.read) ||
      rank[x.severity] - rank[y.severity] ||
      y.at.localeCompare(x.at));

  return { items, unread: count ?? 0 };
}

/**
 * The driver feed: only alerts raised against this driver, or against a vehicle
 * they currently hold. A driver must never see the whole fleet's problems.
 */
export async function getDriverFeed(driverId: string | null): Promise<Feed> {
  if (!driverId) return { items: [], unread: 0 };

  const { data: assignments } = await app()
    .from("vehicle_assignments")
    .select("vehicle_id")
    .eq("driver_id", driverId)
    .is("ended_at", null)
    .returns<{ vehicle_id: string }[]>();

  const vehicleIds = [...new Set((assignments ?? []).map((a) => a.vehicle_id))];

  // PostgREST cannot express "driver_id = X OR vehicle_id IN (...)" with an
  // empty list, so the two halves are fetched separately and merged.
  const [mine, theirs] = await Promise.all([
    app().from("alerts").select(COLS).is("resolved_at", null)
      .eq("driver_id", driverId)
      .order("raised_at", { ascending: false }).limit(LIMIT).returns<AlertRow[]>(),
    vehicleIds.length
      ? app().from("alerts").select(COLS).is("resolved_at", null)
          .in("vehicle_id", vehicleIds)
          .order("raised_at", { ascending: false }).limit(LIMIT).returns<AlertRow[]>()
      : Promise.resolve({ data: [] as AlertRow[] }),
  ]);

  const seen = new Set<string>();
  const rows = [...(mine.data ?? []), ...(theirs.data ?? [])]
    .filter((a) => !seen.has(a.id) && !!seen.add(a.id))
    .sort((a, b) => b.raised_at.localeCompare(a.raised_at))
    .slice(0, LIMIT);

  const items = rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    severity: severityOf(a.severity),
    title: a.title ?? a.kind.replaceAll("_", " "),
    body: a.body,
    at: a.raised_at,
    href: linkFor(a, "driver"),
    read: a.acknowledged_at != null,
  }));

  return { items, unread: items.filter((i) => !i.read).length };
}
