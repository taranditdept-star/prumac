import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ClipboardCheck, Calendar, User, Gauge, Check, AlertTriangle, ShieldAlert, Wrench,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { PhotoGallery } from "@/components/primitives/PhotoGallery";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface InspectionDetail {
  id: string;
  type: "pre_trip" | "post_trip" | "daily_checklist";
  overall_result: "pass" | "attention" | "fail";
  odometer_km: number;
  overall_notes: string | null;
  completed_at: string;
  trip_id: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null; phone: string | null } | null } | null;
}

interface ItemResultRow {
  result: "pass" | "attention" | "fail";
  notes: string | null;
  photo_path: string | null;
  inspection_checklist_items: { label: string; category: string; is_critical: boolean; sort_order: number } | null;
}

interface InspPhotoRow { file_path: string; kind: string; caption: string | null }
interface LinkedFaultRow { id: string; title: string; severity: string; status: string; checklist_item_id: string | null }

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole("fleet_manager", "admin");
  const supabase = await createClient();

  const [{ data: insp }, { data: itemRows }, { data: photos }, { data: faults }] = await Promise.all([
    supabase
      .schema("app")
      .from("inspections")
      .select(`
        id, type, overall_result, odometer_km, overall_notes, completed_at, trip_id,
        vehicles(plate_number, plate_country, make, model),
        drivers(profiles(full_name, phone))
      `)
      .eq("id", id)
      .maybeSingle<InspectionDetail>(),
    supabase
      .schema("app")
      .from("inspection_item_results")
      .select(`result, notes, photo_path, inspection_checklist_items(label, category, is_critical, sort_order)`)
      .eq("inspection_id", id)
      .returns<ItemResultRow[]>(),
    supabase
      .schema("app")
      .from("inspection_photos")
      .select("file_path, kind, caption")
      .eq("inspection_id", id)
      .returns<InspPhotoRow[]>(),
    supabase
      .schema("app")
      .from("faults")
      .select("id, title, severity, status, checklist_item_id")
      .eq("inspection_id", id)
      .returns<LinkedFaultRow[]>(),
  ]);

  if (!insp) notFound();

  const items = [...(itemRows ?? [])].sort(
    (a, b) => (a.inspection_checklist_items?.sort_order ?? 0) - (b.inspection_checklist_items?.sort_order ?? 0),
  );
  const problems = items.filter((i) => i.result !== "pass");
  const okItems = items.filter((i) => i.result === "pass");
  const driverName = insp.drivers?.profiles?.full_name ?? "Unknown driver";

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Link href="/inspections" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to inspections
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-7 lg:px-8 lg:py-8 overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-grid opacity-30 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <OverallPill result={insp.overall_result} />
            <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white capitalize">
              {insp.type.replaceAll("_", " ")}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
            {insp.vehicles ? `${insp.vehicles.make} ${insp.vehicles.model}` : "Checklist"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
            {insp.vehicles && (
              <PlateBadge plate={insp.vehicles.plate_number} country={insp.vehicles.plate_country} size="sm" />
            )}
            <span className="inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" /> {driverName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> {fmt(insp.completed_at)}
            </span>
            <span className="inline-flex items-center gap-1.5 font-plate">
              <Gauge className="h-3.5 w-3.5 text-slate-400" /> {insp.odometer_km.toLocaleString()} km
            </span>
            {insp.trip_id && (
              <Link prefetch={false} href={`/trips/${insp.trip_id}`} className="inline-flex items-center gap-1.5 text-orange-300 hover:text-orange-200">
                View trip →
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Problems first */}
          {problems.length > 0 && (
            <section className="rounded-2xl bg-white border border-rose-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-rose-100 bg-rose-50/50">
                <h2 className="text-base font-bold text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Items flagged ({problems.length})
                </h2>
              </div>
              <div className="divide-y divide-ink-100">
                {problems.map((it, idx) => (
                  <ItemRow key={idx} it={it} />
                ))}
              </div>
            </section>
          )}

          {/* Driver's overall notes */}
          {insp.overall_notes && (
            <section className="rounded-2xl bg-white border border-ink-200/70 p-6">
              <h2 className="text-base font-bold text-ink-900 mb-2">Driver's notes</h2>
              <p className="text-sm text-ink-700 whitespace-pre-line leading-relaxed">{insp.overall_notes}</p>
            </section>
          )}

          {/* Passed items */}
          <section className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
            <div className="px-6 py-4 border-b border-ink-100">
              <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-ink-400" /> All checks ({items.length})
              </h2>
            </div>
            {items.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-ink-400">No item-level results recorded.</p>
            ) : (
              <div className="divide-y divide-ink-100">
                {okItems.map((it, idx) => <ItemRow key={idx} it={it} />)}
                {okItems.length === 0 && <p className="px-6 py-6 text-center text-xs text-ink-400">Every item was flagged.</p>}
              </div>
            )}
          </section>

          {/* Inspection photos (odometer etc.) */}
          {(photos ?? []).length > 0 && (
            <section>
              <h2 className="text-base font-bold text-ink-900 mb-3">Photos</h2>
              <PhotoGallery paths={(photos ?? []).map((p) => p.file_path)} />
            </section>
          )}
        </div>

        {/* Right: linked faults */}
        <div className="space-y-4">
          <section className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h3 className="text-sm font-bold text-ink-900 mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-ink-400" /> Faults from this checklist
            </h3>
            {(faults ?? []).length === 0 ? (
              <p className="text-xs text-ink-500">No faults were raised from this submission.</p>
            ) : (
              <ul className="space-y-2">
                {(faults ?? []).map((f) => (
                  <li key={f.id}>
                    <Link prefetch={false}
                      href={`/faults/${f.id}`}
                      className="flex items-center gap-2 rounded-xl border border-ink-200/70 p-2.5 hover:bg-ink-50/60 transition-colors"
                    >
                      <span className={`h-2 w-2 rounded-full ${f.status === "resolved" || f.status === "wont_fix" ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900">{f.title}</span>
                        <span className="block text-[11px] text-ink-500 capitalize">{f.severity} · {f.status.replaceAll("_", " ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ it }: { it: ItemResultRow }) {
  const label = it.inspection_checklist_items?.label ?? "Item";
  const category = it.inspection_checklist_items?.category ?? "";
  const critical = it.inspection_checklist_items?.is_critical ?? false;
  const cfg = {
    pass: { icon: Check, cls: "text-emerald-600 bg-emerald-50", label: "OK" },
    attention: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-50", label: "Attention" },
    fail: { icon: ShieldAlert, cls: "text-rose-600 bg-rose-50", label: "Fail" },
  }[it.result];
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-3 px-6 py-3.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.cls}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-ink-900">{label}</p>
          {critical && (
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-600">
              Critical
            </span>
          )}
        </div>
        {category && <p className="text-[11px] text-ink-400 uppercase tracking-wide mt-0.5">{category}</p>}
        {it.notes && <p className="mt-1 text-sm text-ink-600 whitespace-pre-line">&ldquo;{it.notes}&rdquo;</p>}
        {it.photo_path && (
          <div className="mt-2 max-w-[200px]">
            <PhotoGallery paths={[it.photo_path]} />
          </div>
        )}
      </div>
      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${cfg.cls}`}>{cfg.label}</span>
    </div>
  );
}

function OverallPill({ result }: { result: "pass" | "attention" | "fail" }) {
  const cfg = {
    pass: { label: "Roadworthy", cls: "bg-emerald-500/20 text-emerald-200" },
    attention: { label: "Needs attention", cls: "bg-amber-500/20 text-amber-200" },
    fail: { label: "Critical", cls: "bg-rose-500/20 text-rose-200" },
  }[result];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${cfg.cls}`}>{cfg.label}</span>;
}
