"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, XCircle, ClipboardCheck, ChevronRight, ChevronLeft, Check, Circle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitStandaloneInspection } from "@/actions/inspections";

interface ChecklistItem {
  id: string;
  sort_order: number;
  category: string;
  label: string;
  is_critical: boolean;
  requires_photo: boolean;
}

interface VehicleChecklistProps {
  vehicleId: string;
  templateId: string;
  templateName: string;
  items: ChecklistItem[];
  currentOdometer: number;
}

type Result = "pass" | "attention" | "fail";
const REVIEW = -1;

export function VehicleChecklist({
  vehicleId,
  templateId,
  templateName,
  items,
  currentOdometer,
}: VehicleChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [odometer, setOdometer] = useState<string>(String(currentOdometer));
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState<Record<string, Result>>(() =>
    Object.fromEntries(items.map((i) => [i.id, "pass" as Result])),
  );
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});

  // Sections in template order.
  const sections = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      if (!map.has(it.category)) map.set(it.category, []);
      map.get(it.category)!.push(it);
    }
    return Array.from(map.entries()).map(([category, group]) => ({ category, group }));
  }, [items]);

  const [confirmed, setConfirmed] = useState<boolean[]>(() => sections.map(() => false));
  const [open, setOpen] = useState(0); // section index, or REVIEW

  const confirmedCount = confirmed.filter(Boolean).length;
  const allConfirmed = confirmedCount === sections.length && sections.length > 0;

  const totals = useMemo(() => {
    const vals = Object.values(results);
    return {
      attention: vals.filter((v) => v === "attention").length,
      fail: vals.filter((v) => v === "fail").length,
    };
  }, [results]);

  const rating: { label: string; tone: Tone } =
    totals.fail > 0
      ? { label: "Critical — needs repair", tone: "rose" }
      : totals.attention > 0
        ? { label: "Attention — minor issues", tone: "amber" }
        : { label: "Good — roadworthy", tone: "emerald" };

  const blockingFails = items.filter((i) => i.is_critical && results[i.id] === "fail");

  function sectionResult(idx: number): Result {
    const g = sections[idx].group;
    if (g.some((it) => results[it.id] === "fail")) return "fail";
    if (g.some((it) => results[it.id] === "attention")) return "attention";
    return "pass";
  }

  function cycle(id: string) {
    setResults((prev) => {
      const next: Result = prev[id] === "pass" ? "attention" : prev[id] === "attention" ? "fail" : "pass";
      return { ...prev, [id]: next };
    });
  }

  function advanceFrom(idx: number) {
    const next = [...confirmed];
    next[idx] = true;
    setConfirmed(next);
    const upcoming = next.findIndex((c) => !c);
    setOpen(upcoming === -1 ? REVIEW : upcoming);
  }

  function allGood(idx: number) {
    const g = sections[idx].group;
    setResults((prev) => {
      const copy = { ...prev };
      for (const it of g) copy[it.id] = "pass";
      return copy;
    });
    setItemNotes((prev) => {
      const copy = { ...prev };
      for (const it of g) delete copy[it.id];
      return copy;
    });
    advanceFrom(idx);
  }

  function handleSubmit() {
    const itemsPayload = items.map((i) => ({
      checklist_item_id: i.id,
      result: results[i.id] ?? "pass",
      notes: itemNotes[i.id] || undefined,
    }));
    startTransition(async () => {
      const result = await submitStandaloneInspection({
        vehicle_id: vehicleId,
        template_id: templateId,
        odometer_km: Number(odometer),
        notes: notes || undefined,
        items: itemsPayload,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        const overall = result.data?.overall_result ?? "pass";
        if (overall === "fail") toast.error("Checklist saved — critical issues found");
        else if (overall === "attention") toast.warning("Checklist saved — items need attention");
        else toast.success("Checklist saved — vehicle roadworthy");
        router.push("/home");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Sticky progress + condition */}
      <div className="sticky top-2 z-10 rounded-2xl border border-ink-200/70 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{templateName}</p>
          <p className="text-xs font-bold tabular text-ink-500">
            {confirmedCount} <span className="text-ink-400">of</span> {sections.length} sections
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          {sections.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                confirmed[i]
                  ? { pass: "bg-emerald-500", attention: "bg-amber-500", fail: "bg-rose-500" }[sectionResult(i)]
                  : open === i
                    ? "bg-orange-500"
                    : "bg-ink-200"
              }`}
            />
          ))}
        </div>
        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${ratingCls(rating.tone)}`}>
          Condition: {rating.label}
        </div>
        {blockingFails.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="text-xs text-rose-700">
              {blockingFails.length} critical item{blockingFails.length !== 1 ? "s" : ""} failed — the vehicle is unsafe to
              drive. Alert your fleet manager before using it.
            </p>
          </div>
        )}
        {allConfirmed && open !== REVIEW && (
          <button
            type="button"
            onClick={() => setOpen(REVIEW)}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 py-2.5 text-sm font-bold text-white"
          >
            Review &amp; submit <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Odometer */}
      <div className="rounded-2xl border border-ink-200/70 bg-white p-4">
        <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Current mileage (km)</Label>
        <Input
          type="number"
          inputMode="numeric"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          className="mt-2 h-14 text-center text-2xl font-plate font-bold tabular"
        />
      </div>

      {/* Review screen */}
      {open === REVIEW ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-200/70 bg-white p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Almost done</p>
            <p className="mt-1 text-lg font-bold text-ink-900">Review &amp; submit</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Tally n={items.length - totals.attention - totals.fail} label="OK" tone="emerald" />
              {totals.attention > 0 && <Tally n={totals.attention} label="Attention" tone="amber" />}
              {totals.fail > 0 && <Tally n={totals.fail} label="Fail" tone="rose" />}
            </div>
            <div className="mt-4">
              <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
                Defects &amp; notes for the manager
              </Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything the fleet manager should know"
                className="mt-2 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
          >
            <ChevronLeft className="h-4 w-4" /> Back to checks
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:bg-orange-600 disabled:opacity-50"
          >
            <ClipboardCheck className="h-5 w-5" />
            {isPending ? "Submitting…" : "Submit checklist"}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      ) : (
        /* Sections */
        <div className="space-y-2.5">
          {sections.map((sec, i) => {
            const isOpen = open === i;
            const done = confirmed[i];
            if (isOpen) {
              const flagged = sec.group.filter((it) => results[it.id] !== "pass");
              const isLast = i === sections.length - 1;
              return (
                <div key={sec.category} className="rounded-2xl border-2 border-orange-400 bg-white p-4">
                  <h3 className="text-base font-bold text-ink-900">{sec.category}</h3>
                  <p className="mb-3 text-xs text-ink-500">
                    {sec.group.length} check{sec.group.length !== 1 ? "s" : ""} — tap any that&rsquo;s a problem, or mark all good.
                  </p>
                  <button
                    type="button"
                    onClick={() => allGood(i)}
                    className="mb-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-white transition-all hover:bg-emerald-600 active:scale-[0.99]"
                  >
                    <CheckCircle2 className="h-5 w-5" /> All good here
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {sec.group.map((it) => (
                      <ItemChip key={it.id} item={it} result={results[it.id]} onClick={() => cycle(it.id)} />
                    ))}
                  </div>
                  {flagged.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {flagged.map((it) => (
                        <input
                          key={it.id}
                          value={itemNotes[it.id] ?? ""}
                          onChange={(e) => setItemNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                          placeholder={`${it.label} — what's wrong?`}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 ${
                            results[it.id] === "fail"
                              ? "border-rose-200 focus:ring-rose-500/30"
                              : "border-amber-200 focus:ring-amber-500/30"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => advanceFrom(i)}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 hover:text-orange-700"
                    >
                      {isLast ? "Review & submit" : "Next section"} <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            }
            // Collapsed: done summary, or pending row
            const res = done ? sectionResult(i) : null;
            return (
              <button
                key={sec.category}
                type="button"
                onClick={() => setOpen(i)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                  done ? "border-ink-200/70 bg-white" : "border-ink-200/60 bg-ink-50/40"
                }`}
              >
                {done ? (
                  <SectionTick result={res!} />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-400">
                    {i + 1}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-900">{sec.category}</span>
                  <span className="block text-xs text-ink-400">
                    {done ? sectionSummary(sec.group, results) : `${sec.group.length} checks`}
                  </span>
                </span>
                {done ? (
                  <span className="text-xs font-semibold text-ink-400">Edit</span>
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Tone = "emerald" | "amber" | "rose";

function ItemChip({ item, result, onClick }: { item: ChecklistItem; result: Result; onClick: () => void }) {
  const cls =
    result === "fail"
      ? "border-rose-300 bg-rose-50 text-rose-700"
      : result === "attention"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : "border-ink-200 bg-white text-ink-700";
  const Icon = result === "fail" ? XCircle : result === "attention" ? AlertCircle : Circle;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium transition-all active:scale-[0.98] ${cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${result === "pass" ? "text-ink-300" : ""}`} />
      {item.label}
      {item.is_critical && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </button>
  );
}

function SectionTick({ result }: { result: Result }) {
  if (result === "pass")
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  const cls = result === "fail" ? "bg-rose-500" : "bg-amber-500";
  const Icon = result === "fail" ? XCircle : AlertCircle;
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${cls}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function sectionSummary(group: ChecklistItem[], results: Record<string, Result>): string {
  const fail = group.filter((it) => results[it.id] === "fail").length;
  const att = group.filter((it) => results[it.id] === "attention").length;
  if (fail > 0) return `${fail} failed${att > 0 ? `, ${att} attention` : ""}`;
  if (att > 0) return `${att} need attention`;
  return "All OK";
}

function Tally({ n, label, tone }: { n: number; label: string; tone: Tone }) {
  const t = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
  }[tone];
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${t}`}>{n} {label}</span>;
}

function ratingCls(tone: Tone): string {
  return {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
  }[tone];
}
