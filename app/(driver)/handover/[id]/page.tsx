import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import { HandoverChecklist } from "@/components/driver/HandoverChecklist";
import { CancelHandoverButton, RejectTakeoverButton } from "@/components/driver/HandoverActions";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface HandoverRow {
  id: string;
  vehicle_id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  direction: "incoming" | "outgoing";
  other_party_name: string | null;
  from_overall: "pass" | "attention" | "fail" | null;
  to_overall: "pass" | "attention" | "fail" | null;
  odometer_km: number | null;
  notes: string | null;
  reject_reason: string | null;
}

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
}

const RESULT = {
  pass: { label: "Good", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  attention: { label: "Attention", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertCircle },
  fail: { label: "Critical", cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
};

export default async function HandoverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth();
  const supabase = await createClient();

  const { data } = await supabase.schema("app").rpc("fn_my_handovers");
  const rows = (Array.isArray(data) ? data : []) as HandoverRow[];
  const h = rows.find((r) => r.id === id);
  if (!h) notFound();

  const isIncomingPending = h.direction === "incoming" && h.status === "pending";

  // For a pending takeover, load the template + items so the receiver can inspect.
  let templateId: string | null = null;
  let template: { id: string; name: string } | null = null;
  let items: ChecklistItem[] = [];
  if (isIncomingPending) {
    const { data: tid } = await supabase
      .schema("app")
      .rpc("fn_template_for_vehicle", { p_vehicle_id: h.vehicle_id });
    templateId = tid as string | null;
    if (templateId) {
      const [{ data: t }, { data: it }] = await Promise.all([
        supabase.schema("app").from("inspection_templates").select("id, name").eq("id", templateId).single<{ id: string; name: string }>(),
        supabase.schema("app").from("inspection_checklist_items").select("id, sort_order, category, label, is_critical").eq("template_id", templateId).order("sort_order").returns<ChecklistItem[]>(),
      ]);
      template = t;
      items = it ?? [];
    }
  }

  const fromR = h.from_overall ? RESULT[h.from_overall] : null;

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link href="/handover" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Handovers
      </Link>

      <header>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 mb-2">
          <ArrowLeftRight className="h-3.5 w-3.5 text-ink-500" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-600 font-bold">
            {h.direction === "incoming" ? "Incoming takeover" : "Outgoing handover"}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ink-900">{h.make} {h.model}</h1>
        <div className="mt-2 flex items-center gap-2">
          <PlateBadge plate={h.plate_number} country={h.plate_country} size="sm" />
        </div>
        <p className="text-sm text-ink-500 mt-2">
          {h.direction === "incoming" ? "From" : "To"} <span className="font-semibold text-ink-700">{h.other_party_name ?? "driver"}</span>
        </p>
      </header>

      {/* Outgoing driver's recorded condition */}
      {fromR && (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${fromR.cls}`}>
          <fromR.Icon className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">Outgoing condition rating</p>
            <p className="text-sm font-semibold">{fromR.label}</p>
          </div>
        </div>
      )}

      {h.notes && (
        <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Notes from sender</p>
          <p className="text-sm text-ink-700 mt-1">{h.notes}</p>
        </div>
      )}

      {/* Takeover checklist for the receiving driver */}
      {isIncomingPending && templateId ? (
        <>
          <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4">
            <p className="text-sm text-orange-800 font-medium">
              Inspect the vehicle and complete the checklist below to confirm you accept it in this condition.
            </p>
          </div>
          <HandoverChecklist
            mode="takeover"
            handoverId={h.id}
            templateId={templateId}
            templateName={template?.name ?? "Checklist"}
            items={items}
            currentOdometer={h.odometer_km ?? 0}
          />
          <RejectTakeoverButton handoverId={h.id} />
        </>
      ) : isIncomingPending ? (
        <p className="text-sm text-rose-600">No checklist template available for this vehicle.</p>
      ) : (
        <StatusSummary h={h} />
      )}

      {/* Outgoing pending → allow cancel */}
      {h.direction === "outgoing" && h.status === "pending" && (
        <CancelHandoverButton handoverId={h.id} />
      )}
    </div>
  );
}

function StatusSummary({ h }: { h: HandoverRow }) {
  const map = {
    pending: { text: "Waiting for the receiving driver to confirm.", cls: "bg-amber-50 border-amber-200 text-amber-800" },
    accepted: { text: "Handover complete — both drivers signed off on the vehicle condition.", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
    rejected: { text: `Rejected${h.reject_reason ? `: ${h.reject_reason}` : "."}`, cls: "bg-rose-50 border-rose-200 text-rose-800" },
    cancelled: { text: "This handover was cancelled.", cls: "bg-ink-50 border-ink-200 text-ink-700" },
  }[h.status];
  return (
    <div className={`rounded-2xl border p-4 text-sm ${map.cls}`}>{map.text}</div>
  );
}
