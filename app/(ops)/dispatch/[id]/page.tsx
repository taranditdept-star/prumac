import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ArrowRight, Package, Clock, Phone, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { JobActions, type VehicleOption, type DriverOption } from "@/components/ops/JobActions";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface JobDetail {
  id: string; reference: string; status: string;
  pickup_label: string; dropoff_label: string; distance_km: number | null;
  cargo_description: string | null; load_count: number | null;
  vehicle_class: string | null; required_at: string | null; is_urgent: boolean;
  contact_name: string | null; contact_phone: string | null; notes: string | null;
  quoted_mode: string | null; quoted_unit: number | null; quoted_amount: number | null;
  quoted_currency: string | null; quoted_at: string | null; quote_notes: string | null;
  vehicle_id: string | null; driver_id: string | null; trip_id: string | null;
  closed_reason: string | null; created_at: string;
  subsidiaries: { name: string } | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

const money = (n: number | null, ccy = "USD") =>
  n === null ? "—" : `${ccy} ${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare" }) : "—";
const title = (v: string | null) => (v ? v.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "—");

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-ink-100 text-ink-700",
  quoted: "bg-sky-100 text-sky-700",
  approved: "bg-violet-100 text-violet-700",
  assigned: "bg-amber-100 text-amber-700",
  in_progress: "bg-emerald-100 text-emerald-700",
  completed: "bg-ink-900 text-white",
  declined: "bg-rose-100 text-rose-700",
  cancelled: "bg-ink-200 text-ink-600",
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("fleet_manager", "admin");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job }, { data: vehicles }, { data: drivers }, { data: rates }] = await Promise.all([
    supabase.schema("app").from("transport_jobs")
      .select(`*, subsidiaries(name), vehicles(plate_number, plate_country, make, model),
               drivers(profiles(full_name))`)
      .eq("id", id).maybeSingle<JobDetail>(),
    supabase.schema("app").from("vehicles")
      .select("id, plate_number, make, model, status")
      .neq("status", "decommissioned").order("plate_number")
      .returns<{ id: string; plate_number: string; make: string; model: string; status: string }[]>(),
    supabase.schema("app").from("drivers")
      .select("id, employee_number, profiles!inner(full_name)")
      .eq("is_active", true)
      .returns<{ id: string; employee_number: string | null; profiles: { full_name: string | null } | null }[]>(),
    supabase.schema("app").from("billing_rates")
      .select("vehicle_id").is("effective_until", null)
      .returns<{ vehicle_id: string }[]>(),
  ]);

  if (!job) notFound();

  const rated = new Set((rates ?? []).map((r) => r.vehicle_id));
  const vehicleOptions: VehicleOption[] = (vehicles ?? []).map((v) => ({
    ...v, hasRate: rated.has(v.id),
  }));
  const driverOptions: DriverOption[] = (drivers ?? [])
    .map((d) => ({ id: d.id, name: d.profiles?.full_name ?? "Unnamed", employee_number: d.employee_number }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Dispatch
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-plate text-sm font-bold text-ink-500">{job.reference}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[job.status] ?? "bg-ink-100 text-ink-700"}`}>
              {title(job.status)}
            </span>
            {job.is_urgent && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                Urgent
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink-900">
            {job.subsidiaries?.name ?? "—"}
          </h1>
        </div>
        {job.quoted_amount !== null && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Quoted</p>
            <p className="text-2xl font-bold text-emerald-800">
              {money(job.quoted_amount, job.quoted_currency ?? "USD")}
            </p>
            <p className="text-[11px] text-emerald-700">
              {title(job.quoted_mode)} · {job.quoted_unit} × {job.distance_km ?? "—"}
            </p>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-ink-200/70 bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-ink-900">The job</h2>
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-800">
              <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="font-semibold">{job.pickup_label}</span>
              <ArrowRight className="h-4 w-4 text-ink-300" />
              <span className="font-semibold">{job.dropoff_label}</span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Detail label="Distance" value={job.distance_km !== null ? `${job.distance_km} km` : "—"} />
              <Detail label="Loads" value={job.load_count !== null ? String(job.load_count) : "—"} />
              <Detail label="Vehicle needed" value={title(job.vehicle_class)} />
              <Detail label="Needed by" value={when(job.required_at)} />
              <Detail label="Logged" value={when(job.created_at)} />
              <Detail label="Contact" value={job.contact_name ?? "—"} />
            </dl>
            {job.cargo_description && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                {job.cargo_description}
              </p>
            )}
            {job.contact_phone && (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
                <Phone className="h-4 w-4 text-ink-400" />
                <span className="font-plate">{job.contact_phone}</span>
              </p>
            )}
            {job.notes && (
              <p className="mt-2 flex items-start gap-2 text-sm text-ink-600">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                {job.notes}
              </p>
            )}
          </section>

          {(job.vehicles || job.drivers) && (
            <section className="rounded-2xl border border-ink-200/70 bg-white p-5">
              <h2 className="mb-3 text-sm font-bold text-ink-900">Allocated</h2>
              <div className="flex flex-wrap items-center gap-3">
                {job.vehicles && (
                  <>
                    <PlateBadge plate={job.vehicles.plate_number} country={job.vehicles.plate_country} />
                    <span className="text-sm text-ink-700">{job.vehicles.make} {job.vehicles.model}</span>
                  </>
                )}
                {job.drivers?.profiles?.full_name && (
                  <span className="rounded-lg bg-ink-100 px-2.5 py-1 text-sm font-semibold text-ink-800">
                    {job.drivers.profiles.full_name}
                  </span>
                )}
              </div>
              {job.trip_id && (
                <Link prefetch={false} href={`/trips/${job.trip_id}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600">
                  Open the trip <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </section>
          )}

          {job.quoted_at && (
            <section className="rounded-2xl border border-ink-200/70 bg-white p-5">
              <h2 className="mb-2 text-sm font-bold text-ink-900">Quote</h2>
              <p className="flex items-center gap-2 text-xs text-ink-500">
                <Clock className="h-3.5 w-3.5" /> Priced {when(job.quoted_at)}
              </p>
              {job.quote_notes && <p className="mt-2 text-sm text-ink-700">{job.quote_notes}</p>}
            </section>
          )}

          {job.closed_reason && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {job.closed_reason}
            </p>
          )}
        </div>

        <JobActions
          jobId={job.id}
          status={job.status}
          distanceKm={job.distance_km}
          loadCount={job.load_count}
          vehicles={vehicleOptions}
          drivers={driverOptions}
          currentVehicleId={job.vehicle_id}
        />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-800">{value}</dd>
    </div>
  );
}
