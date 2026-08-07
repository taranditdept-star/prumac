import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export type LoginStatus = "active" | "idle" | "dormant" | "never";

export interface LoginRow {
  id: string;
  name: string;
  role: string;
  loginId: string | null; // username / email they sign in with
  lastSignInAt: string | null;
  daysSince: number | null;
  status: LoginStatus;
}

export interface LoginActivity {
  rows: LoginRow[];
  summary: { total: number; active: number; idle: number; dormant: number; never: number };
}

// Who's actually signing in to the app, from Supabase Auth's last_sign_in_at.
// active ≤7d · idle 8–30d · dormant >30d · never = has an account but never logged in.
export async function getLoginActivity(): Promise<LoginActivity> {
  const sb = createServiceClient();
  const [{ data: list }, { data: profiles }] = await Promise.all([
    sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    sb.schema("app").from("profiles").select("id, full_name, role, is_active").returns<{ id: string; full_name: string | null; role: string; is_active: boolean }[]>(),
  ]);
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const now = Date.now();

  const rows: LoginRow[] = [];
  for (const u of list?.users ?? []) {
    const p = profById.get(u.id);
    if (!p || p.is_active === false) continue; // only active accounts
    const last = u.last_sign_in_at ?? null;
    const days = last ? Math.floor((now - new Date(last).getTime()) / 86_400_000) : null;
    const status: LoginStatus = last == null ? "never" : days! <= 7 ? "active" : days! <= 30 ? "idle" : "dormant";
    const email = u.email ?? "";
    rows.push({
      id: u.id,
      name: p.full_name ?? email ?? "Unknown",
      role: p.role,
      loginId: email.endsWith("@drivers.prumac.local") ? email.split("@")[0].toUpperCase() : email || null,
      lastSignInAt: last,
      daysSince: days,
      status,
    });
  }

  const rank: Record<LoginStatus, number> = { never: 0, dormant: 1, idle: 2, active: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9));

  const count = (s: LoginStatus) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    summary: { total: rows.length, active: count("active"), idle: count("idle"), dormant: count("dormant"), never: count("never") },
  };
}

// ── Per-person drill-down ────────────────────────────────────────────────────
export interface LoginDetailTrip {
  date: string | null;
  plate: string;
  km: number | null;
  purpose: string;
  status: string;
  route: string;
}
export interface LoginDetail {
  isDriver: boolean;
  phone: string | null;
  email: string | null;
  checkedInToday: boolean;
  vehicle: { plate: string; make: string; model: string } | null;
  trips: LoginDetailTrip[];
  trips30d: number;
}

/** Deep detail for one account — their vehicle, recent trips and today's check-in. */
export async function getLoginDetail(profileId: string): Promise<LoginDetail> {
  const sb = createServiceClient();
  const app = sb.schema("app");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: profile }, { data: driver }, { data: att }] = await Promise.all([
    app.from("profiles").select("phone, email").eq("id", profileId).maybeSingle<{ phone: string | null; email: string | null }>(),
    app.from("drivers").select("id").eq("profile_id", profileId).maybeSingle<{ id: string }>(),
    app.from("attendance").select("profile_id").eq("profile_id", profileId).eq("attendance_date", today).maybeSingle<{ profile_id: string }>(),
  ]);

  const base: LoginDetail = {
    isDriver: !!driver,
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    checkedInToday: !!att,
    vehicle: null,
    trips: [],
    trips30d: 0,
  };
  if (!driver) return base;

  const [{ data: assign }, { data: trips }, { count }] = await Promise.all([
    app
      .from("vehicle_assignments")
      .select("vehicles(plate_number, make, model)")
      .eq("driver_id", driver.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ vehicles: { plate_number: string; make: string; model: string } | null }>(),
    app
      .from("trips")
      .select("started_at, purpose, status, start_odometer_km, end_odometer_km, route_description, origin_label, destination_label, vehicles(plate_number)")
      .eq("driver_id", driver.id)
      .order("started_at", { ascending: false })
      .limit(6)
      .returns<
        { started_at: string | null; purpose: string; status: string; start_odometer_km: number | null; end_odometer_km: number | null; route_description: string | null; origin_label: string | null; destination_label: string | null; vehicles: { plate_number: string } | null }[]
      >(),
    app.from("trips").select("id", { count: "exact", head: true }).eq("driver_id", driver.id).gte("started_at", since),
  ]);

  base.vehicle = assign?.vehicles ? { plate: assign.vehicles.plate_number, make: assign.vehicles.make, model: assign.vehicles.model } : null;
  base.trips30d = count ?? 0;
  base.trips = (trips ?? []).map((t) => ({
    date: t.started_at,
    plate: t.vehicles?.plate_number ?? "—",
    km: t.start_odometer_km != null && t.end_odometer_km != null ? t.end_odometer_km - t.start_odometer_km : null,
    purpose: t.purpose,
    status: t.status,
    route: t.route_description ?? [t.origin_label, t.destination_label].filter(Boolean).join(" → ") ?? "",
  }));
  return base;
}
