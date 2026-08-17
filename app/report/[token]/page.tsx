import { cookies } from "next/headers";
import type { Metadata } from "next";
import { ShieldAlert, Lock, Calendar, MapPin, User, Gauge, FileWarning } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { getAccidentEvidence, getAccidentScenePhotos } from "@/lib/evidence/media";
import { readShareSession, shareCookieName } from "@/lib/evidence/share";
import { verdictLabel } from "@/lib/evidence/verdicts";
import { EvidenceGallery, type GalleryItem } from "@/components/primitives/EvidenceGallery";
import { SharePasswordGate } from "@/components/report/SharePasswordGate";
import { VerdictForm } from "@/components/report/VerdictForm";

export const dynamic = "force-dynamic";

// Keep shared reports out of search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Accident report — PRUMAC",
};

interface AccidentRow {
  id: string;
  severity: string;
  status: string;
  occurred_at: string;
  location_description: string;
  description: string;
  odometer_km: number | null;
  weather: string | null;
  road_conditions: string | null;
  injuries: boolean;
  injuries_details: string | null;
  other_parties_involved: boolean;
  third_party_details: unknown;
  police_report_number: string | null;
  police_station: string | null;
  reported_at: string;
  vehicles: { plate_number: string; make: string; model: string } | null;
  drivers: { profiles: { full_name: string | null } | null } | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
  });
}

/**
 * third_party_details is free-form jsonb. Rendering it with JSON.stringify put
 * raw braces in front of the CEO/HR — and printed a bare "{}" when other parties
 * were involved but nothing was recorded. Turn it into readable lines instead.
 */
function thirdPartyText(a: Pick<AccidentRow, "other_parties_involved" | "third_party_details">): string {
  if (!a.other_parties_involved) return "None";
  const d = a.third_party_details;
  if (d == null) return "Yes — no details recorded";
  if (typeof d === "string") return d.trim() || "Yes — no details recorded";
  if (typeof d === "object") {
    const entries = Object.entries(d as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`);
    return entries.length ? entries.join(" · ") : "Yes — no details recorded";
  }
  return String(d);
}

const SEV: Record<string, string> = {
  minor: "bg-ink-100 text-ink-700",
  moderate: "bg-amber-100 text-amber-800",
  severe: "bg-rose-100 text-rose-800",
  fatal: "bg-rose-600 text-white",
};

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createServiceClient();

  const { data: share } = await service
    .schema("app")
    .from("accident_shares")
    .select("id, accident_id, recipient_label, allow_verdict, revoked_at, password_version")
    .eq("token", token)
    .maybeSingle<{
      id: string;
      accident_id: string;
      recipient_label: string | null;
      allow_verdict: boolean;
      revoked_at: string | null;
      password_version: number;
    }>();

  if (!share || share.revoked_at) {
    return (
      <Shell>
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100">
            <FileWarning className="h-6 w-6 text-ink-400" />
          </div>
          <h1 className="text-lg font-bold text-ink-900">This link isn&apos;t available</h1>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
            It may have been revoked, or the address may be incomplete. Please ask the PRUMAC administrator for a new
            link.
          </p>
        </div>
      </Shell>
    );
  }

  // The link password is the credential — no session, no access.
  const store = await cookies();
  const unlocked = readShareSession(
    store.get(shareCookieName(token))?.value,
    share.id,
    share.password_version ?? 1,
  );
  if (!unlocked) {
    return (
      <Shell>
        <SharePasswordGate token={token} recipient={share.recipient_label} />
      </Shell>
    );
  }

  const [{ data: accident }, evidence, scenePhotos, { data: verdicts }] = await Promise.all([
    service
      .schema("app")
      .from("accidents")
      .select(`
        id, severity, status, occurred_at, location_description, description, odometer_km,
        weather, road_conditions, injuries, injuries_details, other_parties_involved,
        third_party_details, police_report_number, police_station, reported_at,
        vehicles(plate_number, make, model),
        drivers(profiles(full_name))
      `)
      .eq("id", share.accident_id)
      .maybeSingle<AccidentRow>(),
    getAccidentEvidence(share.accident_id),
    getAccidentScenePhotos(share.accident_id),
    service
      .schema("app")
      .from("accident_verdicts")
      .select("id, author_name, author_role, verdict, comment, created_at")
      .eq("accident_id", share.accident_id)
      .order("created_at", { ascending: false })
      .returns<{ id: string; author_name: string; author_role: string | null; verdict: string; comment: string | null; created_at: string }[]>(),
  ]);

  if (!accident) {
    return (
      <Shell>
        <p className="rounded-2xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
          This report is no longer available.
        </p>
      </Shell>
    );
  }

  // Committee evidence is served through our own route, NOT the raw signed URL:
  // that way revoking the link (or resetting the password) cuts media access off
  // at once instead of leaving hours-long bearer URLs in the wild.
  const items: GalleryItem[] = [
    ...scenePhotos.map((p, i) => ({
      id: `scene-${i}`,
      kind: "photo" as const,
      url: p.url,
      original_filename: "Scene photo",
      mime_type: "image/jpeg",
      size_bytes: null,
      caption: null,
      created_at: accident.reported_at,
      // These came from the driver's own report, not the committee.
      source: "driver",
      source_detail: accident.drivers?.profiles?.full_name ?? null,
      uploaded_by_name: null,
    })),
    ...evidence.map((e) => ({ ...e, url: `/report/${token}/media/${e.id}` })),
  ];

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-6 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${SEV[accident.severity] ?? SEV.minor}`}>
              {accident.severity}
            </span>
            <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
              {accident.status}
            </span>
            {accident.injuries && (
              <span className="rounded-lg bg-rose-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                Injuries
              </span>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">Accident report</h1>
          <p className="mt-1 text-sm text-slate-300">
            {accident.vehicles ? `${accident.vehicles.plate_number} · ${accident.vehicles.make} ${accident.vehicles.model}` : "Vehicle"}
          </p>
          <div className="mt-4 grid gap-x-6 gap-y-2 text-sm text-slate-300 sm:grid-cols-2">
            <Fact icon={Calendar} label="Occurred" value={fmt(accident.occurred_at)} />
            <Fact icon={User} label="Driver" value={accident.drivers?.profiles?.full_name ?? "—"} />
            <Fact icon={MapPin} label="Location" value={accident.location_description} />
            <Fact
              icon={Gauge}
              label="Odometer"
              value={accident.odometer_km != null ? `${accident.odometer_km.toLocaleString()} km` : "—"}
            />
          </div>
          {share.recipient_label && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
              <Lock className="h-3 w-3" /> Shared with {share.recipient_label}
            </p>
          )}
        </header>

        {/* Statement */}
        <section className="rounded-2xl border border-ink-200 bg-white p-6">
          <h2 className="text-base font-bold text-ink-900">Driver&apos;s statement</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{accident.description}</p>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Weather" value={accident.weather} />
            <Detail label="Road conditions" value={accident.road_conditions} />
            <Detail label="Injuries" value={accident.injuries ? accident.injuries_details || "Yes" : "None reported"} />
            <Detail label="Third parties" value={thirdPartyText(accident)} />
            <Detail label="Police report no." value={accident.police_report_number} />
            <Detail label="Police station" value={accident.police_station} />
          </dl>
        </section>

        {/* Evidence */}
        <section className="rounded-2xl border border-ink-200 bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-ink-900">Evidence</h2>
          <EvidenceGallery items={items} />
        </section>

        {/* Verdicts */}
        {(verdicts ?? []).length > 0 && (
          <section className="rounded-2xl border border-ink-200 bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-ink-900">Verdicts recorded</h2>
            <ul className="space-y-3">
              {(verdicts ?? []).map((v) => (
                <li key={v.id} className="rounded-xl border border-ink-200/70 bg-ink-50/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink-900">{v.author_name}</span>
                    {v.author_role && <span className="text-xs text-ink-500">· {v.author_role}</span>}
                    <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-ink-700 ring-1 ring-ink-200">
                      {verdictLabel(v.verdict)}
                    </span>
                  </div>
                  {v.comment && <p className="mt-1.5 whitespace-pre-line text-sm text-ink-700">{v.comment}</p>}
                  <p className="mt-1 text-[11px] text-ink-400">{fmt(v.created_at)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Your verdict */}
        {share.allow_verdict && (
          <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-6">
            <h2 className="text-base font-bold text-ink-900">Your verdict</h2>
            <p className="mt-0.5 mb-4 text-xs text-ink-500">
              Record your view of this incident. It is saved against the report for PRUMAC management.
            </p>
            <VerdictForm token={token} defaultRole={share.recipient_label ?? ""} />
          </section>
        )}

        <p className="pb-8 text-center text-[11px] text-ink-400">
          Confidential — PRUMAC Connect. This page is not indexed and should not be forwarded.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50/60 px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-center gap-2 text-ink-500">
          <ShieldAlert className="h-4 w-4 text-orange-600" />
          <span className="text-xs font-bold uppercase tracking-[0.14em]">PRUMAC Connect</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fact({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
        <span className="block break-words text-slate-100">{value}</span>
      </span>
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-800">{value || "—"}</dd>
    </div>
  );
}
