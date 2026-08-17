import { CalendarCheck, Check, Clock, Users, UserCheck, UserX } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLoginActivity } from "@/lib/ops/login-activity";
import { LoginActivityPanel } from "@/components/ops/LoginActivityPanel";
import type { AppRole } from "@/types/domain";

export const dynamic = "force-dynamic";

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function harareToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Harare",
  });
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
}

interface SessionRow {
  id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  profiles: { full_name: string | null; role: AppRole } | null;
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

  const [{ data: profiles }, { data: marks }, { data: sessions }] = await Promise.all([
    supabase
      .schema("app")
      .from("profiles")
      .select("id, full_name, role")
      .neq("role", "subsidiary_billing")
      .eq("is_active", true)
      .order("full_name")
      .returns<ProfileRow[]>(),
    supabase
      .schema("app")
      .from("attendance")
      .select("profile_id, marked_at")
      .eq("attendance_date", date)
      .returns<{ profile_id: string; marked_at: string }[]>(),
    supabase
      .schema("app")
      .from("login_sessions")
      .select("id, login_at, last_seen_at, logout_at, profiles(full_name, role)")
      .order("login_at", { ascending: false })
      .limit(60)
      .returns<SessionRow[]>(),
  ]);

  const login = await getLoginActivity();

  const markByProfile = new Map((marks ?? []).map((m) => [m.profile_id, m.marked_at]));
  const people = (profiles ?? []).map((p) => ({ ...p, markedAt: markByProfile.get(p.id) ?? null }));

  const present = people
    .filter((p) => p.markedAt)
    .sort((a, b) => (a.markedAt! < b.markedAt! ? -1 : 1));
  const absent = people.filter((p) => !p.markedAt);
  const total = people.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8 lg:py-8 space-y-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <CalendarCheck className="h-6 w-6 text-emerald-400" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Attendance</h1>
            <p className="text-sm text-slate-300">{fmtDateLabel(date)}</p>
          </div>
        </div>
      </div>

      {/* Date filter */}
      <form className="flex flex-wrap items-center gap-3" action="/attendance" method="get">
        <label className="text-xs font-bold uppercase tracking-wider text-ink-400">Date</label>
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <button type="submit" className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">
          View
        </button>
        {date !== today && (
          <a href="/attendance" className="text-sm font-medium text-orange-600 hover:text-orange-700">
            Back to today
          </a>
        )}
      </form>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile icon={UserCheck} tone="emerald" label="Checked in" value={present.length} />
        <SummaryTile icon={UserX} tone="rose" label="Not in" value={absent.length} />
        <SummaryTile icon={Users} tone="sky" label="Total staff" value={total} />
      </div>

      {/* Not yet in */}
      {absent.length > 0 && (
        <section>
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
            Not yet checked in ({absent.length})
          </p>
          <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
            {absent.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-500">
                  {(p.full_name ?? "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{p.full_name ?? "Unnamed"}</p>
                  <p className="text-xs text-ink-400">{roleLabel(p.role)}</p>
                </div>
                <span className="rounded-lg bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500">Absent</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Checked in */}
      <section>
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
          Checked in ({present.length})
        </p>
        {present.length === 0 ? (
          <div className="rounded-2xl border border-ink-200/70 bg-white py-12 text-center">
            <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100">
              <Clock className="h-6 w-6 text-ink-400" />
            </div>
            <p className="text-sm font-semibold text-ink-900">No one has checked in yet</p>
            <p className="mt-0.5 text-xs text-ink-500">Attendance appears here as staff mark it.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-emerald-200/70 bg-white">
            {present.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-5 w-5" strokeWidth={3} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{p.full_name ?? "Unnamed"}</p>
                  <p className="text-xs text-ink-400">{roleLabel(p.role)}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <Clock className="h-3 w-3" /> {fmtTime(p.markedAt!)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent login sessions — time in / time out / duration */}
      <section>
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
          Recent login sessions
        </p>
        {(sessions ?? []).length === 0 ? (
          <div className="rounded-2xl border border-ink-200/70 bg-white py-10 text-center text-sm text-ink-500">
            No login sessions recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
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
                  {(sessions ?? []).map((s) => {
                    const end = s.logout_at ?? s.last_seen_at;
                    const stillOn = !s.logout_at && Date.now() - new Date(s.last_seen_at).getTime() < 180_000;
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-semibold text-ink-900">
                          {s.profiles?.full_name ?? "Unknown"}
                          <span className="ml-1.5 text-[11px] font-normal text-ink-400">{s.profiles ? roleLabel(s.profiles.role) : ""}</span>
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

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "rose" | "sky";
  label: string;
  value: number;
}) {
  const t = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-4">
      <div className={`absolute right-0 top-0 h-16 w-16 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular ${t.text}`}>{value}</p>
    </div>
  );
}
