"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft, Check, AlertTriangle, ClipboardCheck, ChevronRight, ShieldAlert,
  Droplet, Disc, Lightbulb, CircleDot, ShieldCheck, Car, Wrench, Gauge,
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

// A rough icon per category so each card has a bit of visual context.
function categoryIcon(category: string) {
  const c = category.toLowerCase();
  if (/(engine|oil|fluid|coolant|fuel)/.test(c)) return Droplet;
  if (/(brake)/.test(c)) return Disc;
  if (/(light|signal|indicat)/.test(c)) return Lightbulb;
  if (/(tyre|tire|wheel)/.test(c)) return CircleDot;
  if (/(safety|cab|belt|extinguish|first)/.test(c)) return ShieldCheck;
  if (/(body|exterior|mirror|glass|screen)/.test(c)) return Car;
  if (/(steer|suspen|mechan)/.test(c)) return Wrench;
  return Gauge;
}

export function VehicleChecklist({
  vehicleId,
  templateId,
  templateName,
  items,
  currentOdometer,
}: VehicleChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const total = items.length;

  const [index, setIndex] = useState(total ? 0 : REVIEW); // current item, or REVIEW
  const [flagging, setFlagging] = useState(false); // "Problem" tapped on the current card
  const [results, setResults] = useState<Record<string, Result>>(
    () => Object.fromEntries(items.map((i) => [i.id, "pass" as Result])),
  );
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [odometer, setOdometer] = useState(String(currentOdometer));
  const [notes, setNotes] = useState("");

  const totals = useMemo(() => {
    const v = Object.values(results);
    return { attention: v.filter((r) => r === "attention").length, fail: v.filter((r) => r === "fail").length };
  }, [results]);

  const rating: { label: string; tone: Tone } =
    totals.fail > 0
      ? { label: "Critical — needs repair", tone: "rose" }
      : totals.attention > 0
        ? { label: "Attention — minor issues", tone: "amber" }
        : { label: "Good — roadworthy", tone: "emerald" };

  const blockingFails = items.filter((i) => i.is_critical && results[i.id] === "fail");

  function goToReviewOrNext(i: number) {
    setFlagging(false);
    setNoteDraft("");
    setIndex(i + 1 >= total ? REVIEW : i + 1);
  }

  function answerOk(item: ChecklistItem, i: number) {
    setResults((p) => ({ ...p, [item.id]: "pass" }));
    setItemNotes((n) => {
      const c = { ...n };
      delete c[item.id];
      return c;
    });
    goToReviewOrNext(i);
  }

  function answerProblem(item: ChecklistItem, i: number, severity: Result) {
    setResults((p) => ({ ...p, [item.id]: severity }));
    setItemNotes((n) => ({ ...n, [item.id]: noteDraft.trim() }));
    goToReviewOrNext(i);
  }

  function back(i: number) {
    if (flagging) {
      setFlagging(false);
      setNoteDraft("");
      return;
    }
    if (i > 0) setIndex(i - 1);
  }

  function handleSubmit() {
    const odo = Number(odometer);
    if (!odometer.trim() || !Number.isFinite(odo) || odo <= 0) {
      toast.error("Enter the current mileage before submitting.");
      return;
    }
    const payload = items.map((i) => {
      const res = results[i.id] ?? "pass";
      return { checklist_item_id: i.id, result: res, notes: res !== "pass" ? itemNotes[i.id] || undefined : undefined };
    });
    startTransition(async () => {
      const result = await submitStandaloneInspection({
        vehicle_id: vehicleId,
        template_id: templateId,
        odometer_km: odo,
        notes: notes || undefined,
        items: payload,
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

  // ── Review screen ──────────────────────────────────────────────────────────
  if (index === REVIEW) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Last step</p>
          <p className="mt-1 text-xl font-bold text-ink-900">Review &amp; submit</p>
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm font-bold ${ratingCls(rating.tone)}`}>
            Condition: {rating.label}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tally n={total - totals.attention - totals.fail} label="OK" tone="emerald" />
            {totals.attention > 0 && <Tally n={totals.attention} label="Attention" tone="amber" />}
            {totals.fail > 0 && <Tally n={totals.fail} label="Fail" tone="rose" />}
          </div>
          {blockingFails.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-xs text-rose-700">
                {blockingFails.length} critical item{blockingFails.length !== 1 ? "s" : ""} failed — the vehicle is unsafe
                to drive. Alert your fleet manager before using it.
              </p>
            </div>
          )}
        </div>

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

        <div className="rounded-2xl border border-ink-200/70 bg-white p-4">
          <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Notes for the manager</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything the fleet manager should know"
            className="mt-2 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>

        <button
          type="button"
          onClick={() => setIndex(total - 1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
        >
          <ChevronLeft className="h-4 w-4" /> Back to last check
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
    );
  }

  // ── Per-item card ──────────────────────────────────────────────────────────
  const item = items[index];
  const Icon = categoryIcon(item.category);
  const answered = index; // items completed before this one

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{item.category}</p>
          <p className="font-plate text-xs font-bold tabular text-ink-500">
            {index + 1} <span className="text-ink-300">/</span> {total}
          </p>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-all"
            style={{ width: `${Math.round(((answered) / total) * 100)}%` }}
          />
        </div>
      </div>

      {/* Item card */}
      <div className="rounded-3xl border border-ink-200/70 bg-white p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold leading-tight text-ink-900">{item.label}</h2>
        {item.is_critical && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-600">
            <ShieldAlert className="h-3 w-3" /> Critical safety check
          </span>
        )}
      </div>

      {!flagging ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answerOk(item, index)}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-500 text-white transition-all hover:bg-emerald-600 active:scale-[0.98]"
          >
            <Check className="h-7 w-7" strokeWidth={2.5} />
            <span className="text-lg font-bold">OK</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNoteDraft(itemNotes[item.id] ?? "");
              setFlagging(true);
            }}
            className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-rose-500 text-white transition-all hover:bg-rose-600 active:scale-[0.98]"
          >
            <AlertTriangle className="h-7 w-7" />
            <span className="text-lg font-bold">Problem</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
          <p className="text-sm font-bold text-ink-900">What&rsquo;s wrong?</p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe the problem (optional)"
            className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => answerProblem(item, index, "attention")}
              className="flex h-14 flex-col items-center justify-center rounded-xl bg-amber-500 text-white transition-all hover:bg-amber-600 active:scale-[0.98]"
            >
              <span className="text-sm font-bold">Minor</span>
              <span className="text-[11px] opacity-90">still driveable</span>
            </button>
            <button
              type="button"
              onClick={() => answerProblem(item, index, "fail")}
              className="flex h-14 flex-col items-center justify-center rounded-xl bg-rose-600 text-white transition-all hover:bg-rose-700 active:scale-[0.98]"
            >
              <span className="text-sm font-bold">Serious</span>
              <span className="text-[11px] opacity-90">unsafe to drive</span>
            </button>
          </div>
        </div>
      )}

      {/* Back */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => back(index)}
          disabled={index === 0 && !flagging}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" /> {flagging ? "Cancel" : "Back"}
        </button>
        <p className="text-xs text-ink-400">{answered} of {total} done</p>
      </div>
    </div>
  );
}

type Tone = "emerald" | "amber" | "rose";

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
