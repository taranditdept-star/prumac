import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, Receipt, User, Building, FileText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { PhotoGallery } from "@/components/primitives/PhotoGallery";
import { RepairReviewActions } from "@/components/billing/RepairReviewActions";
import { StatusPill } from "../page";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface Claim {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: "submitted" | "approved" | "rejected";
  odometer_km: number | null;
  receipt_path: string | null;
  subsidiary_id: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  service_record_id: string | null;
  vehicles: { plate_number: string; plate_country: CountryCode; make: string; model: string } | null;
  profiles: { full_name: string | null } | null;
}

export default async function RepairClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireRole("fleet_manager", "admin", "subsidiary_billing");
  const supabase = await createClient();

  const [{ data: claim }, { data: subs }] = await Promise.all([
    supabase
      .schema("app")
      .from("repair_claims")
      .select(`
        id, description, amount, currency, status, odometer_km, receipt_path,
        subsidiary_id, review_notes, reviewed_at, created_at, service_record_id,
        vehicles(plate_number, plate_country, make, model),
        profiles!repair_claims_submitted_by_fkey(full_name)
      `)
      .eq("id", id)
      .maybeSingle<Claim>(),
    supabase.schema("app").rpc("fn_subsidiary_options"),
  ]);

  if (!claim) notFound();

  const subsidiaries = (Array.isArray(subs) ? subs : []) as { id: string; name: string }[];
  const canReview = profile.role === "fleet_manager" || profile.role === "admin";

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <Link href="/repairs" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Repair claims
      </Link>

      {/* Hero */}
      <div className="relative rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 p-6 lg:p-8 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <StatusPill status={claim.status} />
            <p className="text-3xl font-bold text-white mt-3 tabular font-plate">
              {claim.currency} {Number(claim.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-slate-300 mt-2 max-w-xl">{claim.description}</p>
          </div>
          {claim.vehicles && (
            <div className="text-right">
              <PlateBadge plate={claim.vehicles.plate_number} country={claim.vehicles.plate_country} size="sm" />
              <p className="text-xs text-slate-400 mt-1">
                {claim.vehicles.make} {claim.vehicles.model}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
            <h2 className="text-sm font-bold text-ink-900">Details</h2>
            <Detail icon={User} label="Submitted by" value={claim.profiles?.full_name ?? "—"} />
            <Detail
              icon={Gauge}
              label="Odometer at repair"
              value={claim.odometer_km != null ? `${claim.odometer_km.toLocaleString()} km` : "—"}
            />
            <Detail
              icon={Building}
              label="Suggested subsidiary"
              value={subsidiaries.find((s) => s.id === claim.subsidiary_id)?.name ?? "Not specified"}
            />
            {claim.review_notes && (
              <Detail icon={FileText} label="Review notes" value={claim.review_notes} />
            )}
            {claim.service_record_id && (
              <Detail
                icon={Receipt}
                label="Service record"
                value="Created — will appear as a credit on the next invoice"
              />
            )}
          </div>

          {/* Receipt */}
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h2 className="text-sm font-bold text-ink-900 mb-3 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-ink-500" /> Receipt
            </h2>
            {claim.receipt_path ? (
              <PhotoGallery paths={[claim.receipt_path]} />
            ) : (
              <p className="text-sm text-ink-400">No receipt was uploaded.</p>
            )}
          </div>
        </div>

        {/* Review sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
            <h2 className="text-sm font-bold text-ink-900 mb-3">Review</h2>
            {claim.status !== "submitted" ? (
              <p className="text-sm text-ink-500">
                This claim was {claim.status}
                {claim.reviewed_at
                  ? ` on ${new Date(claim.reviewed_at).toLocaleDateString("en-GB")}`
                  : ""}.
              </p>
            ) : canReview ? (
              <RepairReviewActions
                claimId={claim.id}
                subsidiaries={subsidiaries}
                defaultSubsidiaryId={claim.subsidiary_id}
              />
            ) : (
              <p className="text-sm text-ink-500">Awaiting a fleet manager or admin to review.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-ink-50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-ink-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
        <p className="text-sm text-ink-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
