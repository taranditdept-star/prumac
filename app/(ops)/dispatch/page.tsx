import Link from "next/link";
import { Plus, Truck, Clock, AlertTriangle, CircleDollarSign, MapPin, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { ExportMenu } from "@/components/primitives/ExportMenu";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

type JobStatus =
  | "requested" | "quoted" | "approved" | "assigned"
  | "in_progress" | "completed" | "declined" | "cancelled";

interface JobRow {
  id: string;
  reference: string;
  status: JobStatus;
  pickup_label: string;
  dropoff_label: string;
  distance_km: number | null;
  cargo_description: string | null;
  required_at: string | null;
  is_urgent: boolean;
  quoted_amount: number | null;
  quoted_currency: string | null;
  created_at: string;
  subsidiaries: { name: string } | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

/** The board reads left to right the way the work actually moves. */
const LANES: { key: JobStatus; label: string; hint: string; tone: string }[] = [
  { key: "requested", label: "Requested", hint: "Needs a price", tone: "bg-ink-100 text-ink-700" },
  { key: "quoted", label: "Quoted", hint: "Waiting on the customer", tone: "bg-sky-100 text-sky-700" },
  { key: "approved", label: "Approved", hint: "Needs a truck", tone: "bg-violet-100 text-violet-700" },
  { key: "assigned", label: "Assigned", hint: "Ready to roll", tone: "bg-amber-100 text-amber-700" },
  { key: "in_progress", label: "On the road", hint: "Trip running", tone: "bg-emerald-100 text-emerald-700" },
  { key: "completed", label: "Done", hint: "Ready to invoice", tone: "bg-ink-900 text-white" },
];

const money = (n: number | null, ccy = "USD") =>
  n === null ? "—" : `${ccy} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" }) : null;

export default async function DispatchPage() {
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .schema("app")
    .from("transport_jobs")
    .select(`id, reference, status, pickup_label, dropoff_label, distance_km, cargo_description,
             required_at, is_urgent, quoted_amount, quoted_currency, created_at,
             subsidiaries(name), vehicles(plate_number, plate_country, make, model),
             drivers(profiles(full_name))`)
    .not("status", "in", "(cancelled,declined)")
    .order("is_urgent", { ascending: false })
    .order("required_at", { ascending: true, nullsFirst: false })
    .limit(400)
    .returns<JobRow[]>();

  const all = jobs ?? [];
  const byLane = (s: JobStatus) => all.filter((j) => j.status === s);
  const pipelineValue = all
    .filter((j) => ["quoted", "approved", "assigned", "in_progress"].includes(j.status))
    .reduce((t, j) => t + Number(j.quoted_amount ?? 0), 0);
  const needsPrice = byLane("requested").length;
  const needsTruck = byLane("approved").length;
  const readyToBill = byLane("completed").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-ink-900">Dispatch</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every job from the first phone call through to the invoice
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="jobs" />
          <Link
            href="/dispatch/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800"
          >
            <Plus className="h-4 w-4" /> New job
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Clock} tone="ink" label="Awaiting a price" value={String(needsPrice)} />
        <Kpi icon={Truck} tone="violet" label="Need a truck" value={String(needsTruck)} />
        <Kpi icon={CircleDollarSign} tone="emerald" label="Pipeline value" value={money(pipelineValue)} />
        <Kpi icon={AlertTriangle} tone="amber" label="Ready to invoice" value={String(readyToBill)} />
      </section>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-300">
            <Truck className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-ink-900">No jobs on the board</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
            Trips are currently recorded only after they happen, so nothing links a customer&rsquo;s
            request to the invoice. Log the next request here and it stays connected all the way
            through.
          </p>
          <Link
            href="/dispatch/new"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Log a job
          </Link>
        </div>
      ) : (
        /* Columns on a desktop; on a phone each lane stacks with its own heading. */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {LANES.map((lane) => {
            const items = byLane(lane.key);
            return (
              <section key={lane.key} className="rounded-2xl border border-ink-200/70 bg-white">
                <header className="flex items-center justify-between border-b border-ink-100 px-3.5 py-3">
                  <div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lane.tone}`}>
                      {lane.label}
                    </span>
                    <p className="mt-1 text-[11px] text-ink-400">{lane.hint}</p>
                  </div>
                  <span className="text-sm font-bold text-ink-900">{items.length}</span>
                </header>
                <ul className="divide-y divide-ink-100">
                  {items.length === 0 && (
                    <li className="px-3.5 py-6 text-center text-xs text-ink-400">Nothing here</li>
                  )}
                  {items.map((j) => (
                    <li key={j.id}>
                      <Link prefetch={false} href={`/dispatch/${j.id}`} className="block px-3.5 py-3 hover:bg-ink-50/60">
                        <div className="flex items-center gap-2">
                          <span className="font-plate text-[11px] font-bold text-ink-500">{j.reference}</span>
                          {j.is_urgent && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-ink-900">
                          {j.subsidiaries?.name ?? "—"}
                        </p>
                        <p className="mt-1 flex items-start gap-1 text-xs text-ink-500">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            {j.pickup_label}
                            <ArrowRight className="mx-1 inline h-3 w-3 text-ink-300" />
                            {j.dropoff_label}
                          </span>
                        </p>
                        {j.vehicles && (
                          <div className="mt-2 flex items-center gap-2">
                            <PlateBadge plate={j.vehicles.plate_number} country={j.vehicles.plate_country} size="sm" />
                            <span className="truncate text-[11px] text-ink-500">
                              {j.drivers?.profiles?.full_name ?? "No driver"}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-ink-400">
                            {when(j.required_at) ?? `${j.distance_km ?? "—"} km`}
                          </span>
                          {j.quoted_amount !== null && (
                            <span className="text-xs font-bold text-emerald-700">
                              {money(j.quoted_amount, j.quoted_currency ?? "USD")}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, tone, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "ink" | "violet" | "emerald" | "amber";
  label: string; value: string;
}) {
  const tones = {
    ink: "bg-ink-100 text-ink-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
  } as const;
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-4">
      <span className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-900">{value}</p>
    </div>
  );
}
