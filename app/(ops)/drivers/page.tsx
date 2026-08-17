import Link from "next/link";
import { Users, Plus, IdCard } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ExpiryBadge } from "@/components/primitives/ExpiryBadge";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { ListSearchInput } from "@/components/ops/ListSearchInput";
import { DriverRowActions } from "@/components/ops/DriverRowActions";
import { getExpiryUrgency } from "@/lib/utils/expiry";
import type { CountryCode, DriverRow } from "@/types/domain";

export const dynamic = "force-dynamic";

// The full drivers row (select *) so the inline edit drawer can't blank fields
// updateDriver rewrites — plus the joined profile and current assignment.
interface DriverWithJoins extends DriverRow {
  profiles: {
    full_name: string | null;
    phone: string | null;
    avatar_url: string | null;
    subsidiary_id: string | null;
    access_status: "active" | "suspended" | "deactivated" | null;
  } | null;
  vehicle_assignments: {
    id: string;
    vehicle_id: string;
    ended_at: string | null;
    vehicles: {
      plate_number: string;
      plate_country: CountryCode;
      make: string;
      model: string;
    } | null;
  }[];
}

function gradientFromName(name: string): string {
  const gradients = [
    "from-orange-400 to-pink-500",
    "from-sky-400 to-blue-600",
    "from-emerald-400 to-teal-600",
    "from-violet-400 to-purple-600",
    "from-amber-400 to-orange-600",
    "from-rose-400 to-red-600",
    "from-cyan-400 to-blue-500",
    "from-fuchsia-400 to-pink-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  return gradients[Math.abs(hash) % gradients.length];
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireRole("fleet_manager", "admin");
  const isAdmin = profile.role === "admin";
  const { q: qRaw } = await searchParams;
  const q = (qRaw ?? "").trim().toLowerCase();
  const supabase = await createClient();

  const { data: drivers, error } = await supabase
    .schema("app")
    .from("drivers")
    .select(`
      *,
      profiles!inner(full_name, phone, avatar_url, subsidiary_id, access_status),
      vehicle_assignments(id, vehicle_id, ended_at, vehicles(plate_number, plate_country, make, model))
    `)
    // Suspended/deactivated drivers are INCLUDED (they carry a badge and sort
    // last). Filtering them out made them vanish the moment you suspended one,
    // so "Reactivate" could never be reached from this screen.
    .order("created_at", { ascending: false })
    .returns<DriverWithJoins[]>();

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
          Failed to load drivers: {error.message}
        </div>
      </div>
    );
  }

  // Option lists for the row actions (assign vehicle / edit driver).
  const [{ data: vehicleRows }, { data: subsidiaries }, { data: openAssignments }] = await Promise.all([
    supabase
      .schema("app")
      .from("vehicles")
      .select("id, plate_number, make, model")
      .neq("status", "decommissioned")
      .order("plate_number")
      .returns<{ id: string; plate_number: string; make: string; model: string }[]>(),
    supabase.schema("app").from("subsidiaries").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    supabase
      .schema("app")
      .from("vehicle_assignments")
      .select("vehicle_id, drivers(profiles(full_name))")
      .is("ended_at", null)
      .returns<{ vehicle_id: string; drivers: { profiles: { full_name: string | null } | null } | null }[]>(),
  ]);

  const holderByVehicle = new Map(
    (openAssignments ?? []).map((a) => [a.vehicle_id, a.drivers?.profiles?.full_name ?? null]),
  );
  const vehicleOptions = (vehicleRows ?? []).map((v) => ({ ...v, holder: holderByVehicle.get(v.id) ?? null }));

  const list = drivers ?? [];
  // Keep only CURRENT assignments (ended_at IS NULL) — the embed returns
  // historical rows too, which previously rendered as the driver's live vehicle.
  for (const d of list) {
    d.vehicle_assignments = (d.vehicle_assignments ?? []).filter((a) => a.ended_at === null && a.vehicles);
  }
  const isBlocked = (d: DriverWithJoins) => !d.is_active || d.profiles?.access_status !== "active";
  const sorted = [...list].sort((a, b) => {
    // Suspended / deactivated drivers sort last, then by licence urgency.
    const blockedA = isBlocked(a) ? 1 : 0;
    const blockedB = isBlocked(b) ? 1 : 0;
    if (blockedA !== blockedB) return blockedA - blockedB;
    const order = { expired: 0, critical: 1, warning: 2, ok: 3 } as const;
    const rankA = a.licence_expires_at ? order[getExpiryUrgency(a.licence_expires_at)] : 3;
    const rankB = b.licence_expires_at ? order[getExpiryUrgency(b.licence_expires_at)] : 3;
    return rankA - rankB;
  });

  const shown = q
    ? sorted.filter(
        (d) =>
          (d.profiles?.full_name ?? "").toLowerCase().includes(q) ||
          (d.licence_number ?? "").toLowerCase().includes(q) ||
          (d.profiles?.phone ?? "").toLowerCase().includes(q),
      )
    : sorted;

  const activeList = list.filter((d) => !isBlocked(d));
  const stats = {
    total: activeList.length,
    blocked: list.length - activeList.length,
    assigned: list.filter((d) => d.vehicle_assignments?.some((a) => a.vehicles)).length,
    expiredLicence: list.filter(
      (d) => d.licence_expires_at && getExpiryUrgency(d.licence_expires_at) === "expired",
    ).length,
    expiringSoon: list.filter((d) => {
      if (!d.licence_expires_at) return false;
      const u = getExpiryUrgency(d.licence_expires_at);
      return u === "critical" || u === "warning";
    }).length,
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Drivers</h1>
          <p className="text-sm text-ink-500 mt-1">
            {stats.total} active drivers across the fleet
            {stats.blocked > 0 && <span className="text-ink-400"> · {stats.blocked} suspended or deactivated</span>}
          </p>
        </div>
        <Link
          href="/drivers/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" />
          Add driver
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-violet-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Total drivers</p>
          <p className="text-2xl font-bold text-ink-900 tabular mt-2">{stats.total}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-emerald-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Assigned</p>
          <p className="text-2xl font-bold text-emerald-600 tabular mt-2">{stats.assigned}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-amber-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Expiring</p>
          <p className="text-2xl font-bold text-amber-600 tabular mt-2">{stats.expiringSoon}</p>
        </div>
        <div className="relative rounded-2xl bg-white border border-ink-200/70 p-5 overflow-hidden">
          <div className="absolute top-0 right-0 h-20 w-20 bg-rose-500/10 rounded-full blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Licence expired</p>
          <p className="text-2xl font-bold text-rose-600 tabular mt-2">{stats.expiredLicence}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <ListSearchInput basePath="/drivers" placeholder="Search by name, licence, phone…" />
        {q && (
          <span className="text-xs text-ink-500">{shown.length} of {sorted.length} drivers</span>
        )}
      </div>

      {/* Drivers grid */}
      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <Users className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">{q ? "No drivers match your search" : "No drivers yet"}</p>
          {!q && (
            <>
              <p className="text-xs text-ink-500 mt-1 mb-4">Add your first driver to get started.</p>
              <Link
                href="/drivers/new"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold"
              >
                <Plus className="h-4 w-4" />
                Add driver
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((d) => {
            const name = d.profiles?.full_name ?? "Unknown driver";
            const phone = d.profiles?.phone ?? null;
            const currentAssignment = d.vehicle_assignments?.find((a) => a.vehicles) ?? null;
            const vehicle = currentAssignment?.vehicles;

            const suspended = d.profiles?.access_status === "suspended";
            const blocked = !d.is_active || d.profiles?.access_status === "deactivated";

            return (
              // The card is a div (not a Link) so the actions menu can live inside
              // it — nesting buttons in an anchor is invalid and swallows clicks.
              // A stretched overlay link keeps the whole card clickable.
              <div
                key={d.id}
                className="group relative rounded-2xl bg-white border border-ink-200/70 p-5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-200"
              >
                <Link
                  href={`/drivers/${d.id}`}
                  aria-label={`Open ${name}`}
                  className="absolute inset-0 z-10 rounded-2xl"
                />
                <div className="absolute right-3 top-3 z-20">
                  <DriverRowActions
                    // DriverForm reads `profile` (singular); the Supabase embed
                    // is `profiles`. Without this mapping the required Full-name
                    // box renders empty and a retyped name would overwrite the
                    // canonical one everywhere.
                    driver={{
                      ...d,
                      profile: d.profiles
                        ? {
                            full_name: d.profiles.full_name,
                            phone: d.profiles.phone,
                            subsidiary_id: d.profiles.subsidiary_id,
                          }
                        : undefined,
                    }}
                    driverName={name}
                    profileId={d.profile_id}
                    accessStatus={d.profiles?.access_status ?? "active"}
                    currentAssignmentId={currentAssignment?.id ?? null}
                    currentVehicleLabel={currentAssignment?.vehicles?.plate_number ?? null}
                    vehicles={vehicleOptions}
                    subsidiaries={subsidiaries ?? []}
                    isAdmin={isAdmin}
                  />
                </div>

                {(suspended || blocked) && (
                  <span
                    className={`absolute left-5 top-0 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      suspended ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {suspended ? "Suspended" : "Deactivated"}
                  </span>
                )}

                <div className="flex items-start gap-3 pr-9">
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradientFromName(name)} flex items-center justify-center text-white text-sm font-bold shrink-0 ring-2 ring-white shadow-md`}
                  >
                    {initials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-900 truncate group-hover:text-orange-600 transition-colors">
                      {name}
                    </p>
                    {phone && <p className="text-xs text-ink-500 mt-0.5 font-plate">{phone}</p>}
                    {d.employee_number && (
                      <p className="text-[10px] uppercase tracking-wider text-ink-400 mt-1 font-bold">
                        # {d.employee_number}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-ink-100 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center">
                    <IdCard className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">
                      Licence
                    </p>
                    <p className="text-xs font-plate font-semibold text-ink-800 truncate">
                      {d.licence_country} · {d.licence_number}
                    </p>
                  </div>
                  {d.licence_expires_at && <ExpiryBadge expiresAt={d.licence_expires_at} />}
                </div>

                {d.licence_classes && d.licence_classes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {d.licence_classes.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-700 font-plate"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-ink-100">
                  {vehicle ? (
                    <div className="flex items-center justify-between gap-3">
                      <PlateBadge
                        plate={vehicle.plate_number}
                        country={vehicle.plate_country}
                        size="sm"
                      />
                      <span className="text-xs text-ink-600 truncate">
                        {vehicle.make} {vehicle.model}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-400 italic">No vehicle assigned</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
