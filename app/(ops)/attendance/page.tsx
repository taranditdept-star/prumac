import { CalendarCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLoginActivity } from "@/lib/ops/login-activity";
import { LoginActivityPanel } from "@/components/ops/LoginActivityPanel";
import { AttendanceBoard, type AttendancePerson } from "@/components/ops/AttendanceBoard";
import type { AppRole } from "@/types/domain";

export const dynamic = "force-dynamic";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function harareToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
  });
}

function fmtDuration(startIso: string, endIso: string): string {
  const mins = Math.max(Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000), 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function fmtDateLabel(ymd: string): string {
  // Build at local Harare noon so the weekday/day are correct regardless of TZ.
  const d = new Date(`${ymd}T12:00:00+02:00`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function roleLabel(role: AppRole): string {
  return role === "fleet_manager" ? "Manager" : role.charAt(0).toUpperCase() + role.slice(1);
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: AppRole;
  last_seen_at: string | null;
}

interface SessionRow {
  id: string;
  profile_id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  profiles: { full_name: string | null; role: AppRole } | null;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole("fleet_manager", "admin");
  const sp = await searchParams;
  const today = harareToday();
  const date = sp.date && isDate(sp.date) ? sp.date : today;
  const supabase = await createClient();

  const [{ data: profiles }, { data: marks }, { data: sessions }, { data: driverRows }] = await Promise.all([
    supabase
      .schema("app")
      .from("profiles")
      .select("id, full_name, role, last_seen_at")
      .neq("role", "subsidiary_billing")
      .eq("is_active", true)
      .order("full_name")
      .returns<ProfileRow[]>(),
    supabase
      .schema("app")
      .from("attendance")
      .select("profile_id, marked_at, note")
      .eq("attendance_date", date)
      .returns<{ profile_id: string; marked_at: string; note: string | null }[]>(),
    supabase
      .schema("app")
      .from("login_sessions")
      .select("id, profile_id, login_at, last_seen_at, logout_at, profiles(full_name, role)")
      .order("login_at", { ascending: false })
      .limit(200)
      .returns<SessionRow[]>(),
    supabase
      .schema("app")
      .from("drivers")
      .select("id, profile_id")
      .returns<{ id: string; profile_id: string }[]>(),
  ]);

  const login = await getLoginActivity();

  const markByProfile = new Map((marks ?? []).map((m) => [m.profile_id, m]));
  const driverByProfile = new Map((driverRows ?? []).map((d) => [d.profile_id, d.id]));
  // Newest session per person (the list is already ordered login_at DESC).
  const lastLoginByProfile = new Map<string, string>();
  for (const s of sessions ?? []) {
    if (!lastLoginByProfile.has(s.profile_id)) lastLoginByProfile.set(s.profile_id, s.login_at);
  }

  const people: AttendancePerson[] = (profiles ?? []).map((p) => {
    const mark = markByProfile.get(p.id);
    return {
      id: p.id,
      name: p.full_name ?? "Unnamed",
      role: p.role,
      markedAt: mark?.marked_at ?? null,
      note: mark?.note ?? null,
      lastLoginAt: lastLoginByProfile.get(p.id) ?? null,
      lastSeenAt: p.last_seen_at,
      driverId: driverByProfile.get(p.id) ?? null,
    };
  });

  const recentSessions = (sessions ?? []).slice(0, 60);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8 lg:py-8 space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <CalendarCheck className="h-6 w-6 text-emerald-400" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-white">Attendance</h1>
              <p className="text-sm text-slate-300">{fmtDateLabel(date)}</p>
            </div>
          </div>
          <form className="flex flex-wrap items-center gap-2" action="/attendance" method="get">
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={today}
              className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
            <button type="submit" className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-ink-900 hover:bg-slate-100">
              View
            </button>
            {date !== today && (
              <a href="/attendance" className="px-2 text-sm font-medium text-orange-300 hover:text-orange-200">
                Today
              </a>
            )}
          </form>
        </div>
      </div>

      {/* Interactive board — filter tiles, search, expandable rows, mark on behalf */}
      <AttendanceBoard people={people} date={date} isToday={date === today} />

      {/* Recent login sessions — time in / time out / duration */}
      <section>
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
          Recent login sessions
        </p>
        {recentSessions.length === 0 ? (
          <div className="rounded-2xl border border-ink-200/70 bg-white py-10 text-center text-sm text-ink-500">
            No login sessions recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-[11px] uppercase tracking-wider text-ink-400">
                    <th className="px-4 py-2.5 font-bold">Person</th>
                    <th className="px-4 py-2.5 font-bold">Logged in</th>
                    <th className="px-4 py-2.5 font-bold">Logged out / last active</th>
                    <th className="px-4 py-2.5 font-bold">Duration</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {recentSessions.map((s) => {
                    const end = s.logout_at ?? s.last_seen_at;
                    const stillOn = !s.logout_at && Date.now() - new Date(s.last_seen_at).getTime() < 180_000;
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-semibold text-ink-900">
                          {s.profiles?.full_name ?? "Unknown"}
                          <span className="ml-1.5 text-[11px] font-normal text-ink-400">
                            {s.profiles ? roleLabel(s.profiles.role) : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-600">{fmtDateTime(s.login_at)}</td>
                        <td className="px-4 py-3 text-ink-600">
                          {s.logout_at ? fmtDateTime(s.logout_at) : `${fmtDateTime(s.last_seen_at)} (approx)`}
                        </td>
                        <td className="px-4 py-3 font-plate text-ink-700">{fmtDuration(s.login_at, end)}</td>
                        <td className="px-4 py-3">
                          {stillOn ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
                            </span>
                          ) : s.logout_at ? (
                            <span className="text-xs font-semibold text-ink-400">Signed out</span>
                          ) : (
                            <span className="text-xs font-semibold text-amber-600">Left (tab closed)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-2 px-1 text-[11px] text-ink-400">
          Most drivers close the app instead of signing out, so &ldquo;last active&rdquo; is the approximate log-out time.
        </p>
      </section>

      {/* App login activity — interactive, drill into each person */}
      <LoginActivityPanel rows={login.rows} summary={login.summary} />
    </div>
  );
}
