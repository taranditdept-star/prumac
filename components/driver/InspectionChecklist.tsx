"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, XCircle, ClipboardCheck, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitInspection } from "@/actions/inspections";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
  requires_photo: boolean;
}

interface InspectionChecklistProps {
  tripId: string;
  templateId: string;
  templateName: string;
  type: "pre_trip" | "post_trip";
  items: ChecklistItem[];
  currentOdometer: number;
}

type Result = "pass" | "attention" | "fail";

interface ItemState {
  result: Result | null;
  notes: string;
}

export function InspectionChecklist({
  tripId,
  templateId,
  templateName,
  type,
  items,
  currentOdometer,
}: InspectionChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [odometer, setOdometer] = useState<string>(String(currentOdometer));
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map((i) => [i.id, { result: null, notes: "" }])),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const totals = useMemo(() => {
    const vals = Object.values(state);
    return {
      pass: vals.filter((v) => v.result === "pass").length,
      attention: vals.filter((v) => v.result === "attention").length,
      fail: vals.filter((v) => v.result === "fail").length,
      pending: vals.filter((v) => v.result === null).length,
    };
  }, [state]);

  const blockingFails = items.filter(
    (i) => i.is_critical && state[i.id]?.result === "fail",
  );

  function setItem(id: string, patch: Partial<ItemState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function handleSubmit() {
    // Default pending items to "pass" — drivers can override
    const itemsPayload = items.map((i) => ({
      checklist_item_id: i.id,
      result: state[i.id]?.result ?? "pass",
      notes: state[i.id]?.notes || undefined,
    }));

    startTransition(async () => {
      const result = await submitInspection({
        trip_id: tripId,
        type,
        template_id: templateId,
        odometer_km: Number(odometer),
        notes: notes || undefined,
        items: itemsPayload,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        const overall = result.data?.overall_result ?? "pass";
        if (overall === "fail") {
          toast.error("Inspection submitted — critical issues found");
        } else if (overall === "attention") {
          toast.warning("Inspection submitted — items need attention");
        } else {
          toast.success("Inspection passed");
        }
        router.push(`/trip/${tripId}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Progress strip */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-4 sticky top-2 z-10 shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">
          {templateName}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Chip n={totals.pass} label="Pass" tone="emerald" />
          <Chip n={totals.attention} label="Attention" tone="amber" />
          <Chip n={totals.fail} label="Fail" tone="rose" />
          {totals.pending > 0 && <Chip n={totals.pending} label="Pending" tone="ink" />}
        </div>
        {blockingFails.length > 0 && (
          <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-2.5 flex items-start gap-2">
            <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700">
              {blockingFails.length} critical item{blockingFails.length !== 1 ? "s" : ""} failed.
              Vehicle is unsafe to drive — alert your fleet manager before the trip starts.
            </p>
          </div>
        )}
      </div>

      {/* Odometer */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Odometer reading (km)
        </Label>
        <Input
          type="number"
          inputMode="numeric"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          className="h-14 mt-2 text-2xl font-plate font-bold tabular text-center"
        />
      </div>

      {/* Grouped items */}
      <div className="space-y-4">
        {grouped.map(([category, group]) => (
          <div key={category} className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
            <p className="px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold bg-ink-50 border-b border-ink-100">
              {category}
            </p>
            <ul className="divide-y divide-ink-100">
              {group.map((it) => {
                const cur = state[it.id];
                return (
                  <li key={it.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-900">
                          {it.label}
                          {it.is_critical && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                              CRITICAL
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Result picker */}
                    <div className="grid grid-cols-3 gap-2">
                      <ResultBtn
                        active={cur?.result === "pass"}
                        onClick={() => setItem(it.id, { result: "pass" })}
                        tone="emerald"
                        icon={CheckCircle2}
                        label="Pass"
                      />
                      <ResultBtn
                        active={cur?.result === "attention"}
                        onClick={() => setItem(it.id, { result: "attention" })}
                        tone="amber"
                        icon={AlertCircle}
                        label="Attention"
                      />
                      <ResultBtn
                        active={cur?.result === "fail"}
                        onClick={() => setItem(it.id, { result: "fail" })}
                        tone="rose"
                        icon={XCircle}
                        label="Fail"
                      />
                    </div>

                    {(cur?.result === "attention" || cur?.result === "fail") && (
                      <textarea
                        value={cur.notes}
                        onChange={(e) => setItem(it.id, { notes: e.target.value })}
                        placeholder="Notes — what's wrong?"
                        rows={2}
                        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Overall notes */}
      <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          Overall notes (optional)
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else the manager should know"
          className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        <ClipboardCheck className="h-5 w-5" />
        {isPending ? "Submitting…" : "Submit inspection"}
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function ResultBtn({
  active,
  onClick,
  tone,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  tone: "emerald" | "amber" | "rose";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const toneMap = {
    emerald: { bg: "bg-emerald-500", text: "text-white", borderActive: "border-emerald-500", inactiveText: "text-emerald-700", inactiveBorder: "border-emerald-200", inactiveBg: "bg-emerald-50" },
    amber: { bg: "bg-amber-500", text: "text-white", borderActive: "border-amber-500", inactiveText: "text-amber-700", inactiveBorder: "border-amber-200", inactiveBg: "bg-amber-50" },
    rose: { bg: "bg-rose-500", text: "text-white", borderActive: "border-rose-500", inactiveText: "text-rose-700", inactiveBorder: "border-rose-200", inactiveBg: "bg-rose-50" },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
        active
          ? `${toneMap.bg} ${toneMap.text} ${toneMap.borderActive}`
          : `${toneMap.inactiveBg} ${toneMap.inactiveText} ${toneMap.inactiveBorder} hover:opacity-80`
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Chip({ n, label, tone }: { n: number; label: string; tone: "emerald" | "amber" | "rose" | "ink" }) {
  const t = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    rose: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
    ink: { bg: "bg-ink-100", text: "text-ink-600", dot: "bg-ink-400" },
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg ${t.bg} px-2 py-1 text-xs font-semibold ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {n} {label}
    </span>
  );
}
