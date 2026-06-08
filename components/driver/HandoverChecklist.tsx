"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, XCircle, ArrowLeftRight, ChevronRight, UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initiateHandover, confirmTakeover } from "@/actions/handovers";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
}

type Result = "pass" | "attention" | "fail";

interface BaseProps {
  templateId: string;
  templateName: string;
  items: ChecklistItem[];
  currentOdometer: number;
}

type Props =
  | (BaseProps & {
      mode: "initiate";
      vehicleId: string;
      drivers: { id: string; full_name: string | null }[];
    })
  | (BaseProps & {
      mode: "takeover";
      handoverId: string;
    });

export function HandoverChecklist(props: Props) {
  const { templateId, templateName, items, currentOdometer, mode } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [odometer, setOdometer] = useState(String(currentOdometer));
  const [notes, setNotes] = useState("");
  const [toDriver, setToDriver] = useState(mode === "initiate" ? "" : "");
  const [state, setState] = useState<Record<string, { result: Result | null; notes: string }>>(
    () => Object.fromEntries(items.map((i) => [i.id, { result: null, notes: "" }])),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  function setItem(id: string, patch: Partial<{ result: Result; notes: string }>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function handleSubmit() {
    if (mode === "initiate" && !toDriver) {
      toast.error("Select the driver receiving the vehicle.");
      return;
    }
    const itemsPayload = items.map((i) => ({
      checklist_item_id: i.id,
      result: state[i.id]?.result ?? ("pass" as Result),
      notes: state[i.id]?.notes || undefined,
    }));

    startTransition(async () => {
      if (mode === "initiate") {
        const res = await initiateHandover({
          vehicle_id: props.vehicleId,
          to_driver_id: toDriver,
          template_id: templateId,
          odometer_km: Number(odometer),
          handover_notes: notes || undefined,
          items: itemsPayload,
        });
        if ("error" in res) toast.error(res.error);
        else {
          toast.success("Handover started — waiting for the receiving driver to confirm");
          router.push("/handover");
          router.refresh();
        }
      } else {
        const res = await confirmTakeover({
          handover_id: props.handoverId,
          template_id: templateId,
          odometer_km: Number(odometer),
          notes: notes || undefined,
          items: itemsPayload,
        });
        if ("error" in res) toast.error(res.error);
        else {
          toast.success("Takeover confirmed — the vehicle is now assigned to you");
          router.push("/home");
          router.refresh();
        }
      }
    });
  }

  return (
    <div className="space-y-5">
      {mode === "initiate" && (
        <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck className="h-4 w-4 text-ink-500" />
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Hand over to *
            </Label>
          </div>
          <select
            value={toDriver}
            onChange={(e) => setToDriver(e.target.value)}
            className="h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-base appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          >
            <option value="">— select receiving driver —</option>
            {props.drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name ?? "Driver"}</option>
            ))}
          </select>
        </div>
      )}

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
                    <p className="text-sm font-medium text-ink-900">
                      {it.label}
                      {it.is_critical && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-rose-600">
                          CRITICAL
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <ResultBtn active={cur?.result === "pass"} onClick={() => setItem(it.id, { result: "pass" })} tone="emerald" icon={CheckCircle2} label="Pass" />
                      <ResultBtn active={cur?.result === "attention"} onClick={() => setItem(it.id, { result: "attention" })} tone="amber" icon={AlertCircle} label="Attention" />
                      <ResultBtn active={cur?.result === "fail"} onClick={() => setItem(it.id, { result: "fail" })} tone="rose" icon={XCircle} label="Fail" />
                    </div>
                    {(cur?.result === "attention" || cur?.result === "fail") && (
                      <textarea
                        value={cur.notes}
                        onChange={(e) => setItem(it.id, { notes: e.target.value })}
                        placeholder="Comments"
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

      <div className="rounded-2xl bg-white border border-ink-200/70 p-4">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          {mode === "initiate" ? "Notes for the receiving driver" : "Notes on the vehicle condition"}
        </Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        {mode === "initiate" ? <ArrowLeftRight className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {isPending
          ? "Submitting…"
          : mode === "initiate"
          ? "Start handover"
          : "Confirm takeover"}
        <ChevronRight className="h-5 w-5" />
      </button>
      <p className="text-center text-[11px] text-ink-400">{templateName}</p>
    </div>
  );
}

function ResultBtn({
  active, onClick, tone, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  tone: "emerald" | "amber" | "rose";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const toneMap = {
    emerald: { bg: "bg-emerald-500", inactiveText: "text-emerald-700", inactiveBorder: "border-emerald-200", inactiveBg: "bg-emerald-50" },
    amber: { bg: "bg-amber-500", inactiveText: "text-amber-700", inactiveBorder: "border-amber-200", inactiveBg: "bg-amber-50" },
    rose: { bg: "bg-rose-500", inactiveText: "text-rose-700", inactiveBorder: "border-rose-200", inactiveBg: "bg-rose-50" },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
        active ? `${toneMap.bg} text-white border-transparent` : `${toneMap.inactiveBg} ${toneMap.inactiveText} ${toneMap.inactiveBorder} hover:opacity-80`
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
