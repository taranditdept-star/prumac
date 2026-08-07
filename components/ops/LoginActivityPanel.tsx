"use client";

import { useMemo, useState } from "react";
import {
  Search, ChevronDown, LogIn, Clock, MoonStar, UserX, Truck, Phone, Mail,
  CheckCircle2, CircleSlash, Loader2, Route, MapPin, AlertTriangle, RotateCw,
} from "lucide-react";
import { loadLoginDetail } from "@/actions/logins";
import type { LoginRow, LoginStatus, LoginDetail } from "@/lib/ops/login-activity";

type Filter = "all" | LoginStatus;

const TONE: Record<LoginStatus, { chip: string; dot: string; ring: string }> = {
  active: { chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", ring: "bg-emerald-500 text-white" },
  idle: { chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500", ring: "bg-amber-100 text-amber-700" },
  dormant: { chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500", ring: "bg-rose-100 text-rose-700" },
  never: { chip: "bg-ink-100 text-ink-500", dot: "bg-ink-300", ring: "bg-ink-100 text-ink-500" },
};
const LABEL: Record<LoginStatus, string> = { active: "Active", idle: "Idle", dormant: "Dormant", never: "Never" };

function fmtLastLogin(iso: string | null, days: number | null): string {
  if (!iso || days == null) return "Never logged in";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTripDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function roleLabel(role: string): string {
  return role === "fleet_manager" ? "Manager" : role.charAt(0).toUpperCase() + role.slice(1);
}

const TILES: { key: Filter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "active", label: "Active", icon: LogIn },
  { key: "idle", label: "Idle", icon: Clock },
  { key: "dormant", label: "Dormant", icon: MoonStar },
  { key: "never", label: "Never in", icon: UserX },
];

export function LoginActivityPanel({
  rows,
  summary,
}: {
  rows: LoginRow[];
  summary: { total: number; active: number; idle: number; dormant: number; never: number };
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LoginDetail | "loading" | "error">>({});

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q && !`${r.name} ${r.role} ${r.loginId ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  async function load(id: string) {
    setDetails((d) => ({ ...d, [id]: "loading" }));
    try {
      const detail = await loadLoginDetail(id);
      setDetails((d) => ({ ...d, [id]: detail }));
    } catch {
      setDetails((d) => ({ ...d, [id]: "error" }));
    }
  }

  function toggle(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    const cur = details[id];
    if (!cur || cur === "error") load(id);
  }

  const count = (k: Filter) => (k === "all" ? summary.total : summary[k]);

  return (
    <section className="pt-2">
      <div className="mb-3 flex items-center gap-2">
        <LogIn className="h-4 w-4 text-ink-400" />
        <h2 className="text-sm font-bold text-ink-900">App login activity</h2>
        <span className="text-xs text-ink-400">— tap anyone to see their vehicle &amp; recent trips</span>
      </div>

      {/* Filter tiles */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map((tile) => {
          const on = filter === tile.key;
          const tone = TONE[tile.key as LoginStatus];
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setFilter(on ? "all" : tile.key)}
              className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                on ? "border-orange-300 ring-2 ring-orange-500/20" : "border-ink-200/70 hover:border-ink-300"
              } bg-white`}
            >
              <div className="flex items-center gap-2">
                <tile.icon className="h-4 w-4 text-ink-400" />
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{tile.label}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                <p className="text-2xl font-bold tabular text-ink-900">{count(tile.key)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
        {filter !== "all" && (
          <button type="button" onClick={() => setFilter("all")} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-orange-600 hover:text-orange-700">
            Clear filter
          </button>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-400">No one matches that.</p>
        ) : (
          shown.map((r) => {
            const tone = TONE[r.status];
            const open = openId === r.id;
            const detail = details[r.id];
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-expanded={open}
                  aria-controls={`chitsano-login-${r.id}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50/50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.ring}`}>
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{r.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      {roleLabel(r.role)}
                      {r.loginId ? ` · ${r.loginId}` : ""}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-medium text-ink-600">{fmtLastLogin(r.lastSignInAt, r.daysSince)}</p>
                    <span className={`mt-0.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>{LABEL[r.status]}</span>
                  </div>
                  <span className={`sm:hidden inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}>{LABEL[r.status]}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                {open && (
                  <div id={`chitsano-login-${r.id}`} className="border-t border-ink-100 bg-ink-50/40 px-4 py-3">
                    {/* Mobile last-login line */}
                    <p className="mb-2 text-xs text-ink-500 sm:hidden">Last login: {fmtLastLogin(r.lastSignInAt, r.daysSince)}</p>

                    {detail === "error" ? (
                      <div className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-rose-600">
                          <AlertTriangle className="h-4 w-4" /> Couldn&rsquo;t load details.
                        </span>
                        <button
                          type="button"
                          onClick={() => load(r.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-50"
                        >
                          <RotateCw className="h-3.5 w-3.5" /> Retry
                        </button>
                      </div>
                    ) : detail === "loading" || !detail ? (
                      <div className="flex items-center gap-2 py-3 text-sm text-ink-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold ${detail.checkedInToday ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-500"}`}>
                            {detail.checkedInToday ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleSlash className="h-3.5 w-3.5" />}
                            {detail.checkedInToday ? "Checked in today" : "Not checked in today"}
                          </span>
                          {detail.phone && (
                            <a href={`tel:${detail.phone}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-medium text-ink-600 ring-1 ring-ink-200 hover:text-orange-600">
                              <Phone className="h-3.5 w-3.5" /> {detail.phone}
                            </a>
                          )}
                          {detail.email && !detail.email.endsWith("@drivers.prumac.local") && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-medium text-ink-500 ring-1 ring-ink-200">
                              <Mail className="h-3.5 w-3.5" /> {detail.email}
                            </span>
                          )}
                        </div>

                        {detail.isDriver ? (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <Truck className="h-4 w-4 text-ink-400" />
                              {detail.vehicle ? (
                                <span className="text-ink-800">
                                  <span className="font-plate font-semibold">{detail.vehicle.plate}</span>{" "}
                                  <span className="text-ink-500">{detail.vehicle.make} {detail.vehicle.model}</span>
                                </span>
                              ) : (
                                <span className="text-ink-400">No vehicle currently assigned</span>
                              )}
                              <span className="ml-auto text-xs text-ink-400">{detail.trips30d} trip{detail.trips30d === 1 ? "" : "s"} in 30 days</span>
                            </div>

                            {detail.trips.length > 0 ? (
                              <div className="overflow-hidden rounded-xl border border-ink-200/70 bg-white">
                                <p className="border-b border-ink-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Recent trips</p>
                                <ul className="divide-y divide-ink-100">
                                  {detail.trips.map((t, i) => (
                                    <li key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                                      <span className="w-12 shrink-0 font-semibold text-ink-500">{fmtTripDate(t.date)}</span>
                                      <span className="font-plate font-semibold text-ink-700">{t.plate}</span>
                                      <span className="flex min-w-0 flex-1 items-center gap-1 text-ink-500">
                                        {t.route ? <><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{t.route}</span></> : <span className="text-ink-300">{t.purpose}</span>}
                                      </span>
                                      {t.km != null && <span className="shrink-0 font-plate font-semibold text-orange-600">{t.km.toLocaleString()} km</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="flex items-center gap-1.5 text-xs text-ink-400"><Route className="h-3.5 w-3.5" /> No trips recorded yet.</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-ink-400">Office account — no vehicle or trips.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
