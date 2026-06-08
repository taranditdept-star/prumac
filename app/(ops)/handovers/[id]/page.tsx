import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, ArrowLeftRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { StatusPill } from "../page";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface Detail {
  id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  odometer_km: number | null;
  notes: string | null;
  reject_reason: string | null;
  from_signed_at: string | null;
  to_signed_at: string | null;
  created_at: string;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  from_driver: { profiles: { full_name: string | null } | null } | null;
  to_driver: { profiles: { full_name: string | null } | null } | null;
  from_inspection: { overall_result: "pass" | "attention" | "fail"; odometer_km: number } | null;
  to_inspection: { overall_result: "pass" | "attention" | "fail"; odometer_km: number } | null;
}

const RESULT = {
  pass: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  attention: { label: "Attention", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertCircle },
  fail: { label: "Critical", cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
};

export default async function OpsHandoverDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const { data: h } = await supabase
    .schema("app")
    .from("vehicle_handovers")
    .select(`
      id, status, odometer_km, notes, reject_reason, from_signed_at, to_signed_at, created_at,
      vehicles(plate_number, plate_country, make, model),
      from_driver:drivers!vehicle_handovers_from_driver_id_fkey(profiles(full_name)),
      to_driver:drivers!vehicle_handovers_to_driver_id_fkey(profiles(full_name)),
      from_inspection:inspections!vehicle_handovers_from_inspection_id_fkey(overall_result, odometer_km),
      to_inspection:inspections!vehicle_handovers_to_inspection_id_fkey(overall_result, odometer_km)
    `)
    .eq("id", id)
    .maybeSingle<Detail>();

  if (!h) notFound();

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <Link href="/handovers" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Handovers
      </Link>

      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-6 lg:p-8 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <StatusPill status={h.status} />
            <h1 className="text-2xl font-bold text-white mt-3">
              {h.vehicles?.make} {h.vehicles?.model}
            </h1>
            <p className="text-sm text-slate-300 mt-2 inline-flex items-center gap-2">
              <span className="font-semibold text-white">{h.from_driver?.profiles?.full_name ?? "—"}</span>
              <ArrowLeftRight className="h-4 w-4" />
              <span className="font-semibold text-white">{h.to_driver?.profiles?.full_name ?? "—"}</span>
            </p>
          </div>
          {h.vehicles && (
            <PlateBadge plate={h.vehicles.plate_number} country={h.vehicles.plate_country} size="sm" />
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <InspectionCard title="Outgoing checklist" who={h.from_driver?.profiles?.full_name} insp={h.from_inspection} signedAt={h.from_signed_at} />
        <InspectionCard title="Takeover checklist" who={h.to_driver?.profiles?.full_name} insp={h.to_inspection} signedAt={h.to_signed_at} />
      </div>

      <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
        <Row icon={Gauge} label="Handover odometer" value={h.odometer_km != null ? `${h.odometer_km.toLocaleString()} km` : "—"} />
        {h.notes && <Row label="Notes" value={h.notes} />}
        {h.reject_reason && <Row label="Reject reason" value={h.reject_reason} />}
      </div>
    </div>
  );
}

function InspectionCard({
  title, who, insp, signedAt,
}: {
  title: string;
  who: string | null | undefined;
  insp: { overall_result: "pass" | "attention" | "fail"; odometer_km: number } | null;
  signedAt: string | null;
}) {
  const r = insp ? RESULT[insp.overall_result] : null;
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{title}</p>
      <p className="text-sm font-semibold text-ink-800 mt-1">{who ?? "—"}</p>
      {r ? (
        <div className={`mt-3 rounded-xl border px-3 py-2 inline-flex items-center gap-2 ${r.cls}`}>
          <r.Icon className="h-4 w-4" />
          <span className="text-sm font-bold">{r.label}</span>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-400">Not completed</p>
      )}
      {signedAt && (
        <p className="text-[11px] text-ink-400 mt-2">
          Signed {new Date(signedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

function Row({
  icon: Icon, label, value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="h-8 w-8 rounded-lg bg-ink-50 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-ink-500" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
        <p className="text-sm text-ink-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
