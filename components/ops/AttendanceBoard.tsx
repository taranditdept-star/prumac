"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search, Check, Clock, UserCheck, UserX, Users, ChevronDown, X, Undo2, ArrowUpRight, LogIn,
} from "lucide-react";
import { markAttendanceFor, clearAttendanceFor } from "@/actions/attendance-admin";
import type { AppRole } from "@/types/domain";

export interface AttendancePerson {
  id: string;
  name: string;
  role: AppRole;
  markedAt: string | null;
  note: string | null;
  /** Most recent login session, if any. */
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  driverId: string | null;
}

type Tab = "all" | "in" | "out";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
  });
}
function roleLabel(role: AppRole): string {
  return role === "fleet_manager" ? "Manager" : role.charAt(0).toUpperCase() + role.slice(1);
}
function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
/** Marks added on someone's behalf carry this note (see actions/attendance-admin.ts). */
function byManager(p: AttendancePerson): boolean {
  return p.note === "Marked by a manager";
}

export function AttendanceBoard({
  people,
  date,
  isToday,
}: {
  people: AttendancePerson[];
  /** Local Harare YYYY-MM-DD the board is showing. */
  date: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // A SET (not one slot) so two rows toggled at once don't clear each other's
  // busy state and allow a duplicate submit.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const inCount = people.filter((p) => p.markedAt).length;
  const outCount = people.length - inCount;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => (tab === "in" ? !!p.markedAt : tab === "out" ? !p.markedAt : true))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || roleLabel(p.role).toLowerCase().includes(needle))
      .sort((a, b) => {
        // Checked-in first (earliest first), then everyone else by name.
        if (!!a.markedAt !== !!b.markedAt) return a.markedAt ? -1 : 1;
        if (a.markedAt && b.markedAt) return a.markedAt < b.markedAt ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [people, tab, q]);

  function toggle(p: AttendancePerson) {
    const marking = !p.markedAt;
    if (busyIds.has(p.id)) return;
    if (!marking && !confirm(`Clear ${p.name}'s check-in for this day?`)) return;
    setBusyIds((s) => new Set(s).add(p.id));
    startTransition(async () => {
      try {
        const r = marking ? await markAttendanceFor(p.id, date) : await clearAttendanceFor(p.id, date);
        if ("error" in r) toast.error(r.error);
        else {
          toast.success(marking ? `${p.name} marked present` : `${p.name}'s check-in cleared`);
          router.refresh();
        }
      } catch (e) {
        // Without this the button would sit disabled on "…" forever after a
        // network drop, with no indication anything went wrong.
        toast.error(e instanceof Error ? e.message : "Couldn't save that — try again.");
      } finally {
        setBusyIds((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Clickable summary tiles double as filters */}
      <div className="grid grid-cols-3 gap-3">
        <Tile active={tab === "in"} onClick={() => setTab(tab === "in" ? "all" : "in")} icon={UserCheck} tone="emerald" label="Checked in" value={inCount} />
        <Tile active={tab === "out"} onClick={() => setTab(tab === "out" ? "all" : "out")} icon={UserX} tone="rose" label="Not in" value={outCount} />
        <Tile active={tab === "all"} onClick={() => setTab("all")} icon={Users} tone="sky" label="Total staff" value={people.length} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search staff by name or role…"
          className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-10 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400">
          {tab === "in" ? "Checked in" : tab === "out" ? "Not yet checked in" : "Everyone"} ({shown.length})
        </p>
        {tab !== "all" && (
          <button type="button" onClick={() => setTab("all")} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
            Show everyone
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-ink-200/70 bg-white py-12 text-center">
          <div className="mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100">
            <Clock className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">Nobody matches</p>
          <p className="mt-0.5 text-xs text-ink-500">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200/70 bg-white">
          {shown.map((p) => {
            const isIn = !!p.markedAt;
            const open = expanded === p.id;
            const busy = busyIds.has(p.id);
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : p.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isIn ? "bg-emerald-500 text-white" : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      {isIn ? <Check className="h-5 w-5" strokeWidth={3} /> : initial(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{p.name}</span>
                      <span className="block text-xs text-ink-400">{roleLabel(p.role)}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-300 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>

                  {isIn ? (
                    // A manager-added mark records WHEN IT WAS ADDED, which isn't
                    // the person's arrival time — so label it rather than passing
                    // the click time off as a check-in time.
                    byManager(p) ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <Clock className="h-3 w-3" /> added by manager
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <Clock className="h-3 w-3" /> {fmtTime(p.markedAt!)}
                      </span>
                    )
                  ) : (
                    <span className="shrink-0 rounded-lg bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-500">Absent</span>
                  )}

                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    disabled={busy}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      isIn
                        ? "border-ink-200 text-ink-600 hover:bg-ink-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {busy ? "…" : isIn ? (
                      <span className="inline-flex items-center gap-1"><Undo2 className="h-3.5 w-3.5" /> Undo</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Mark in</span>
                    )}
                  </button>
                </div>

                {open && (
                  <div className="border-t border-ink-100 bg-ink-50/40 px-4 py-3">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Detail
                        label={byManager(p) ? "Marked at" : "Checked in"}
                        value={p.markedAt ? fmtTime(p.markedAt) : "—"}
                      />
                      <Detail label="Last login" value={p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : "never"} />
                      <Detail label="Last active" value={p.lastSeenAt ? fmtDateTime(p.lastSeenAt) : "—"} />
                      <Detail label="Note" value={p.note ?? "—"} />
                    </dl>
                    {p.driverId && (
                      <Link prefetch={false}
                        href={`/drivers/${p.driverId}`}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
                      >
                        Open driver profile <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {!p.lastLoginAt && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700">
                        <LogIn className="h-3.5 w-3.5" /> This person has never signed in to the app.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[11px] text-ink-400">
        {isToday
          ? "Tap a name to see detail. You can mark someone in (or undo it) on their behalf."
          : "Viewing a past day — marking still applies to that date."}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-semibold text-ink-800">{value}</dd>
    </div>
  );
}

function Tile({
  active, onClick, icon: Icon, tone, label, value,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "rose" | "sky";
  label: string;
  value: number;
}) {
  const t = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-300" },
    rose: { bg: "bg-rose-500/10", text: "text-rose-600", ring: "ring-rose-300" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-600", ring: "ring-sky-300" },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 ${
        active ? `border-transparent ring-2 ${t.ring}` : "border-ink-200/70"
      }`}
    >
      <div className={`absolute right-0 top-0 h-16 w-16 ${t.bg} rounded-full blur-2xl`} />
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${t.text}`} />
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular ${t.text}`}>{value}</p>
    </button>
  );
}
