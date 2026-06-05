import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, User, MapPin, CloudDrizzle, Construction, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { AccidentSeverityBadge, AccidentStatusBadge } from "@/components/primitives/SeverityBadge";
import { PhotoGallery } from "@/components/primitives/PhotoGallery";
import { AccidentStatusUpdater } from "@/components/ops/AccidentStatusUpdater";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface AccidentDetail {
  id: string;
  severity: "minor" | "moderate" | "severe" | "fatal";
  status: string;
  occurred_at: string;
  location_description: string;
  odometer_km: number | null;
  weather: string | null;
  road_conditions: string | null;
  description: string;
  other_parties_involved: boolean;
  third_party_details: { notes?: string } | null;
  injuries: boolean;
  injuries_details: string | null;
  police_report_number: string | null;
  police_station: string | null;
  reported_at: string;
  closed_at: string | null;
  closed_notes: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null; phone: string | null } | null } | null;
}

interface PhotoRow { file_path: string }

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function AccidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: accident }, { data: photos }] = await Promise.all([
    supabase
      .schema("app")
      .from("accidents")
      .select(`
        *,
        vehicles(plate_number, plate_country, make, model),
        drivers(profiles(full_name, phone))
      `)
      .eq("id", id)
      .maybeSingle<AccidentDetail>(),
    supabase
      .schema("app")
      .from("accident_photos")
      .select("file_path")
      .eq("accident_id", id)
      .returns<PhotoRow[]>(),
  ]);

  if (!accident) notFound();

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/accidents"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to accidents
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <AccidentSeverityBadge severity={accident.severity} />
            <AccidentStatusBadge status={accident.status} />
            {accident.injuries && (
              <span className="inline-flex items-center rounded-md bg-rose-500/20 text-rose-200 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
                INJURIES INVOLVED
              </span>
            )}
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            {accident.location_description}
          </h1>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
            {accident.vehicles && (
              <span className="inline-flex items-center gap-1.5">
                <PlateBadge
                  plate={accident.vehicles.plate_number}
                  country={accident.vehicles.plate_country}
                  size="sm"
                />
                <span className="ml-1 text-slate-300">
                  {accident.vehicles.make} {accident.vehicles.model}
                </span>
              </span>
            )}
            {accident.drivers?.profiles?.full_name && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                {accident.drivers.profiles.full_name}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              {fmt(accident.occurred_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
            <h2 className="text-base font-bold text-ink-900 mb-3">Driver's account</h2>
            <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">{accident.description}</p>
          </section>

          {/* Conditions */}
          {(accident.weather || accident.road_conditions) && (
            <section className="grid grid-cols-2 gap-4">
              {accident.weather && (
                <ConditionCard icon={CloudDrizzle} tone="sky" label="Weather" value={accident.weather} />
              )}
              {accident.road_conditions && (
                <ConditionCard icon={Construction} tone="amber" label="Road" value={accident.road_conditions} />
              )}
            </section>
          )}

          {/* Third parties */}
          {accident.other_parties_involved && accident.third_party_details && (
            <section className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-bold mb-2">
                Other parties involved
              </p>
              <p className="text-sm text-amber-900 whitespace-pre-line">
                {accident.third_party_details.notes ?? "—"}
              </p>
            </section>
          )}

          {/* Injuries */}
          {accident.injuries && accident.injuries_details && (
            <section className="rounded-2xl bg-rose-50 border border-rose-200 p-5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-rose-700 font-bold mb-2">
                Injuries
              </p>
              <p className="text-sm text-rose-900 whitespace-pre-line">{accident.injuries_details}</p>
            </section>
          )}

          {/* Police */}
          {(accident.police_report_number || accident.police_station) && (
            <section className="rounded-2xl bg-white border border-ink-200/70 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-violet-600" />
                <h3 className="text-sm font-bold text-ink-900">Police record</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Case number</p>
                  <p className="font-plate font-semibold text-ink-900 mt-0.5">
                    {accident.police_report_number ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Station</p>
                  <p className="text-ink-900 mt-0.5">{accident.police_station ?? "—"}</p>
                </div>
              </div>
            </section>
          )}

          {accident.closed_notes && (
            <section className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-bold mb-2">
                Closing notes
              </p>
              <p className="text-sm text-emerald-900 whitespace-pre-line">{accident.closed_notes}</p>
            </section>
          )}

          <section>
            <h2 className="text-base font-bold text-ink-900 mb-3">Scene photos</h2>
            <PhotoGallery paths={(photos ?? []).map((p) => p.file_path)} />
          </section>
        </div>

        <div className="space-y-4">
          <AccidentStatusUpdater accidentId={id} currentStatus={accident.status} />

          <section className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h3 className="text-sm font-bold text-ink-900 mb-3">Timeline</h3>
            <ol className="space-y-3">
              <Step label="Occurred" ts={accident.occurred_at} />
              <Step label="Reported" ts={accident.reported_at} />
              {accident.closed_at && <Step label="Closed" ts={accident.closed_at} />}
            </ol>
          </section>

          {(accident.drivers?.profiles?.phone || accident.odometer_km != null) && (
            <section className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
              {accident.drivers?.profiles?.phone && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Driver phone</p>
                  <p className="font-plate text-sm font-semibold text-ink-900 mt-0.5">
                    {accident.drivers.profiles.phone}
                  </p>
                </div>
              )}
              {accident.odometer_km != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">Odometer</p>
                  <p className="font-plate text-sm font-semibold text-ink-900 mt-0.5">
                    {accident.odometer_km.toLocaleString()} km
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "amber";
  label: string;
  value: string;
}) {
  const t = {
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
  }[tone];
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center mb-3 ${t}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="text-sm font-bold text-ink-900 mt-1">{value}</p>
    </div>
  );
}

function Step({ label, ts }: { label: string; ts: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="h-2 w-2 rounded-full bg-orange-500 mt-1.5 shrink-0" />
      <div className="flex-1 pt-0">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">{fmt(ts)}</p>
      </div>
    </li>
  );
}
