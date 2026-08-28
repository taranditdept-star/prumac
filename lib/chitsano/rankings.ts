import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAll } from "@/lib/export/paginate";
import type { Shape, Subject } from "./nlu";

/**
 * "Who does the most / least X" answers.
 *
 * These questions had no tool at all — the login tool only ever reported who
 * was NOT signing in, so even when the question was understood the answer was
 * the wrong end of the list.
 */

const app = () => createServiceClient().schema("app");
const money = (n: number) => `USD ${Math.round(n).toLocaleString("en-GB")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-GB");

interface Tally { label: string; value: number; extra?: string }

/** Renders a leaderboard the way a person would say it out loud. */
function board(title: string, rows: Tally[], unit: string, shape: Shape, empty: string): string {
  if (rows.length === 0) return empty;
  const sorted = [...rows].sort((a, b) => (shape === "rank_bottom" ? a.value - b.value : b.value - a.value));
  const top = sorted.slice(0, 5);
  const lines = top.map((r, i) => {
    const medal = shape === "rank_bottom" ? `${i + 1}.` : ["🥇", "🥈", "🥉", "4.", "5."][i];
    return `${medal} ${r.label} — ${num(r.value)} ${unit}${r.extra ? ` (${r.extra})` : ""}`;
  });
  return [title, ...lines].join("\n");
}

/** Who signs in most, or least — from login_sessions, not last-seen. */
export async function rankLogins(shape: Shape): Promise<string> {
  const [{ rows: sessions }, { data: profiles }, { data: drivers }] = await Promise.all([
    fetchAll<{ profile_id: string; login_at: string }>(
      () => app().from("login_sessions").select("profile_id, login_at").order("login_at")),
    app().from("profiles").select("id, full_name, role").eq("is_active", true)
      .returns<{ id: string; full_name: string | null; role: string }[]>(),
    app().from("drivers").select("profile_id, employee_number")
      .returns<{ profile_id: string; employee_number: string | null }[]>(),
  ]);

  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.profile_id, (counts.get(s.profile_id) ?? 0) + 1);
  const empOf = new Map((drivers ?? []).map((d) => [d.profile_id, d.employee_number]));

  const rows: Tally[] = (profiles ?? []).map((p) => ({
    // Two people share the name "TENDAI MIKE MEDA" — one a driver account with
    // no sign-ins, one an admin with several. Unqualified, the two answers read
    // as the assistant contradicting itself.
    label: p.full_name ?? "Unnamed",
    value: counts.get(p.id) ?? 0,
    extra: [p.role.replaceAll("_", " "), empOf.get(p.id)].filter(Boolean).join(" · "),
  }));

  // Sign-in tracking began part-way through the system's life, so these counts
  // start from that date rather than from the beginning. Saying so is the
  // difference between a fact and a misleading one.
  const since = sessions[0]?.login_at
    ? new Date(sessions[0].login_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  if (shape === "rank_bottom") {
    const never = rows.filter((r) => r.value === 0);
    if (never.length > 0) {
      const names = never.slice(0, 10).map((r) => r.label).join(", ");
      return `${never.length} people have never signed in: ${names}${never.length > 10 ? `, and ${never.length - 10} more` : ""}.`;
    }
  }
  const table = board(
    shape === "rank_bottom" ? "Signing in least:" : "Signing in most:",
    rows.filter((r) => shape === "rank_bottom" || r.value > 0),
    "sign-ins", shape,
    "Nobody has signed in yet.",
  );
  return since ? `${table}
(Counted since ${since}, when sign-in tracking started.)` : table;
}

/** Busiest vehicles, by distance actually recorded. */
export async function rankVehicles(shape: Shape): Promise<string> {
  const { rows: data } = await fetchAll<{
    start_odometer_km: number | null; end_odometer_km: number | null;
    vehicles: { plate_number: string; make: string; model: string } | null;
  }>(() => app().from("trips")
    .select("start_odometer_km, end_odometer_km, vehicles(plate_number, make, model)")
    .not("end_odometer_km", "is", null)
    .order("started_at", { ascending: false }));

  const byPlate = new Map<string, { km: number; trips: number; label: string }>();
  for (const t of data) {
    if (!t.vehicles) continue;
    const km = Number(t.end_odometer_km) - Number(t.start_odometer_km);
    if (!Number.isFinite(km) || km <= 0) continue;
    const key = t.vehicles.plate_number;
    const row = byPlate.get(key) ?? { km: 0, trips: 0, label: `${key} (${t.vehicles.make} ${t.vehicles.model})` };
    row.km += km; row.trips += 1;
    byPlate.set(key, row);
  }
  const rows: Tally[] = [...byPlate.values()].map((r) => ({
    label: r.label, value: Math.round(r.km), extra: `${r.trips} trips`,
  }));
  return board(
    shape === "rank_bottom" ? "Least used vehicles:" : "Hardest-working vehicles:",
    rows, "km", shape, "No trips have recorded any distance yet.",
  );
}

/** Busiest drivers, by trips and distance. */
export async function rankDrivers(shape: Shape): Promise<string> {
  const { rows: data } = await fetchAll<{
    start_odometer_km: number | null; end_odometer_km: number | null;
    drivers: { profiles: { full_name: string | null } | null } | null;
  }>(() => app().from("trips")
    .select("start_odometer_km, end_odometer_km, drivers(profiles(full_name))")
    .order("started_at", { ascending: false }));

  const byName = new Map<string, { trips: number; km: number }>();
  for (const t of data) {
    const name = t.drivers?.profiles?.full_name;
    if (!name) continue;
    const row = byName.get(name) ?? { trips: 0, km: 0 };
    row.trips += 1;
    const km = Number(t.end_odometer_km) - Number(t.start_odometer_km);
    if (Number.isFinite(km) && km > 0) row.km += km;
    byName.set(name, row);
  }
  const rows: Tally[] = [...byName.entries()].map(([name, r]) => ({
    label: name, value: r.trips, extra: r.km > 0 ? `${num(r.km)} km` : undefined,
  }));
  return board(
    shape === "rank_bottom" ? "Fewest trips:" : "Busiest drivers:",
    rows, "trips", shape, "No trips recorded against a driver yet.",
  );
}

/** Vehicles giving the most trouble. */
export async function rankFaults(shape: Shape): Promise<string> {
  const { rows: data } = await fetchAll<{ vehicles: { plate_number: string } | null }>(
    () => app().from("faults").select("vehicles(plate_number)").order("reported_at", { ascending: false }));
  const byPlate = new Map<string, number>();
  for (const f of data) {
    if (!f.vehicles) continue;
    byPlate.set(f.vehicles.plate_number, (byPlate.get(f.vehicles.plate_number) ?? 0) + 1);
  }
  const rows: Tally[] = [...byPlate.entries()].map(([label, value]) => ({ label, value }));
  return board(
    shape === "rank_bottom" ? "Fewest faults:" : "Most faults reported:",
    rows, "faults", shape, "No faults reported.",
  );
}

/** Who owes the most. */
export async function rankDebtors(shape: Shape): Promise<string> {
  const { rows: data } = await fetchAll<{ balance_outstanding: number; subsidiaries: { name: string } | null }>(
    () => app().from("invoices").select("balance_outstanding, subsidiaries(name)")
      .gt("balance_outstanding", 0).order("issued_at", { ascending: false }));
  const byName = new Map<string, number>();
  for (const i of data) {
    const n = i.subsidiaries?.name ?? "Unknown";
    byName.set(n, (byName.get(n) ?? 0) + Number(i.balance_outstanding));
  }
  const rows = [...byName.entries()].map(([label, value]) => ({ label, value }));
  if (rows.length === 0) return "Nothing is outstanding — every invoice is settled.";
  const sorted = [...rows].sort((a, b) => (shape === "rank_bottom" ? a.value - b.value : b.value - a.value)).slice(0, 5);
  return [
    shape === "rank_bottom" ? "Owing the least:" : "Owing the most:",
    ...sorted.map((r, i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${r.label} — ${money(r.value)}`),
  ].join("\n");
}

/** Fuel spend by vehicle. */
export async function rankFuel(shape: Shape): Promise<string> {
  const { rows: data } = await fetchAll<{ litres: number | null; total_cost: number | null; vehicles: { plate_number: string } | null }>(
    () => app().from("fuel_logs").select("litres, total_cost, vehicles(plate_number)")
      .order("filled_at", { ascending: false }));
  const byPlate = new Map<string, { cost: number; litres: number }>();
  for (const f of data) {
    if (!f.vehicles) continue;
    const row = byPlate.get(f.vehicles.plate_number) ?? { cost: 0, litres: 0 };
    row.cost += Number(f.total_cost ?? 0);
    row.litres += Number(f.litres ?? 0);
    byPlate.set(f.vehicles.plate_number, row);
  }
  const rows: Tally[] = [...byPlate.entries()].map(([label, r]) => ({
    label, value: Math.round(r.cost), extra: `${num(r.litres)} litres`,
  }));
  if (rows.length === 0) {
    return "No fuel has been logged yet, so I can't rank fuel spend. Only a handful of fills have ever been recorded.";
  }
  return board(
    shape === "rank_bottom" ? "Least fuel spend:" : "Most fuel spend:",
    rows, "USD", shape, "No fuel logged.",
  );
}

/**
 * Picks the ranking from the subject AND the metric.
 *
 * "Which driver does the most trips" and "which vehicle does the most km" both
 * measure trips; only the subject says whether to group by driver or by
 * vehicle. Choosing on the metric alone answered one of them with the other.
 */
export function resolveRanker(
  topic: string | null,
  subject: Subject,
): ((shape: Shape) => Promise<string>) | null {
  if (subject === "customers") return rankDebtors;

  if (subject === "drivers") {
    if (topic === "logins") return rankLogins;
    return rankDrivers;                 // trips, km, anything else per driver
  }

  if (subject === "vehicles") {
    if (topic === "fuel") return rankFuel;
    if (topic === "faults") return rankFaults;
    return rankVehicles;
  }

  // No subject named — fall back to the metric's natural grouping.
  switch (topic) {
    case "logins": return rankLogins;
    case "fuel": return rankFuel;
    case "faults": return rankFaults;
    case "finance": return rankDebtors;
    case "drivers": return rankDrivers;
    case "trips":
    case "vehicles": return rankVehicles;
    default: return null;
  }
}
