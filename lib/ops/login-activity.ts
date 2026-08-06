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
