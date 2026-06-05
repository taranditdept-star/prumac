import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench, Calendar, User, Gauge } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { FaultSeverityBadge, FaultStatusBadge } from "@/components/primitives/SeverityBadge";
import { PhotoGallery } from "@/components/primitives/PhotoGallery";
import { FaultStatusUpdater } from "@/components/ops/FaultStatusUpdater";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface FaultDetail {
  id: string;
  vehicle_id: string;
  trip_id: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  category: string;
  title: string;
  description: string;
  odometer_km: number | null;
  reported_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_notes: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null; phone: string | null } | null } | null;
}

interface PhotoRow { file_path: string }

export default async function FaultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: fault }, { data: photos }] = await Promise.all([
    supabase
      .schema("app")
      .from("faults")
      .select(`
        *,
        vehicles(plate_number, plate_country, make, model),
        drivers(profiles(full_name, phone))
      `)
      .eq("id", id)
      .maybeSingle<FaultDetail>(),
    supabase
      .schema("app")
      .from("fault_photos")
      .select("file_path")
      .eq("fault_id", id)
      .returns<PhotoRow[]>(),
  ]);

  if (!fault) notFound();

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        href="/faults"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to faults
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <FaultSeverityBadge severity={fault.severity} />
            <FaultStatusBadge status={fault.status} />
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400 font-bold capitalize">
              {fault.category}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">{fault.title}</h1>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
            {fault.vehicles && (
              <span className="inline-flex items-center gap-1.5">
                <PlateBadge
                  plate={fault.vehicles.plate_number}
                  country={fault.vehicles.plate_country}
                  size="sm"
                />
                <span className="ml-1 text-slate-300">
                  {fault.vehicles.make} {fault.vehicles.model}
                </span>
              </span>
            )}
            {fault.drivers?.profiles?.full_name && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                {fault.drivers.profiles.full_name}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              {new Date(fault.reported_at).toLocaleString("en-GB", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
            {fault.odometer_km != null && (
              <span className="inline-flex items-center gap-1.5 font-plate">
                <Gauge className="h-3.5 w-3.5 text-slate-400" />
                {fault.odometer_km.toLocaleString()} km
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: description + photos */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
            <h2 className="text-base font-bold text-ink-900 mb-3">Driver's description</h2>
            <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">
              {fault.description}
            </p>
          </section>

          {fault.resolved_notes && (
            <section className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-700 font-bold mb-2">
                Resolution notes
              </p>
              <p className="text-sm text-emerald-900 whitespace-pre-line">{fault.resolved_notes}</p>
            </section>
          )}

          <section>
            <h2 className="text-base font-bold text-ink-900 mb-3">Photos</h2>
            <PhotoGallery paths={(photos ?? []).map((p) => p.file_path)} />
          </section>
        </div>

        {/* Right: status updater + timeline */}
        <div className="space-y-4">
          <FaultStatusUpdater faultId={id} currentStatus={fault.status} />

          <section className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h3 className="text-sm font-bold text-ink-900 mb-3">Timeline</h3>
            <ol className="space-y-3">
              <TLI
                ts={fault.reported_at}
                label="Reported"
                icon={Wrench}
                tone="sky"
              />
              {fault.acknowledged_at && (
                <TLI ts={fault.acknowledged_at} label="Acknowledged" icon={Wrench} tone="violet" />
              )}
              {fault.resolved_at && (
                <TLI ts={fault.resolved_at} label={fault.status === "wont_fix" ? "Closed (won't fix)" : "Resolved"} icon={Wrench} tone="emerald" />
              )}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function TLI({
  ts,
  label,
  icon: Icon,
  tone,
}: {
  ts: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "sky" | "violet" | "emerald";
}) {
  const t = {
    sky: "bg-sky-50 text-sky-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }[tone];
  return (
    <li className="flex items-start gap-3">
      <div className={`h-8 w-8 rounded-lg ${t} flex items-center justify-center shrink-0`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 pt-1">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="text-[11px] text-ink-500 mt-0.5">
          {new Date(ts).toLocaleString("en-GB", {
            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </p>
      </div>
    </li>
  );
}
