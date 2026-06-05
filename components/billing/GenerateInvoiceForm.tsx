"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, Calendar, Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { generateInvoice } from "@/actions/billing";

interface SubsidiaryOpt {
  id: string;
  name: string;
}

interface GenerateInvoiceFormProps {
  subsidiaries: SubsidiaryOpt[];
}

function firstOfMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}
function firstOfNextMonth(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split("T")[0];
}

export function GenerateInvoiceForm({ subsidiaries }: GenerateInvoiceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [subId, setSubId] = useState("");
  const [periodStart, setPeriodStart] = useState(firstOfMonth(lastMonth()));
  const [periodEnd, setPeriodEnd] = useState(firstOfMonth(new Date()));

  function lastMonth(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  }

  const periodLabel = useMemo(() => {
    if (!periodStart) return "";
    return new Date(periodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [periodStart]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await generateInvoice(fd);
        if (result && "error" in result) toast.error(result.error);
      } catch (err) {
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
          toast.error(err.message);
        }
      }
    });
  }

  function presetMonth(offset: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    setPeriodStart(firstOfMonth(d));
    setPeriodEnd(firstOfNextMonth(d));
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-violet-600" />
          <h2 className="text-base font-bold text-ink-900">Subsidiary</h2>
        </div>
        <select
          name="subsidiary_id"
          value={subId}
          onChange={(e) => setSubId(e.target.value)}
          className={selectCls}
          required
        >
          <option value="">— select a subsidiary —</option>
          {subsidiaries.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl bg-white border border-ink-200/70 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-sky-600" />
          <h2 className="text-base font-bold text-ink-900">Period</h2>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: "Last month", offset: -1 },
            { label: "This month", offset: 0 },
            { label: "2 months ago", offset: -2 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => presetMonth(p.offset)}
              className="h-9 px-3 rounded-xl border border-ink-200 bg-white text-xs font-semibold text-ink-700 hover:border-orange-300 hover:bg-orange-50 transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Period start
            </Label>
            <input
              type="date"
              name="period_start"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className={inputCls + " font-plate"}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              Period end (exclusive)
            </Label>
            <input
              type="date"
              name="period_end"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className={inputCls + " font-plate"}
              required
            />
          </div>
        </div>

        {periodLabel && (
          <p className="text-xs text-ink-500 mt-2">
            Will bill all completed trips for <span className="font-semibold text-ink-700">{periodLabel}</span>.
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white p-5 shadow-lg shadow-violet-500/20">
        <Receipt className="h-5 w-5 text-violet-200 mb-2" />
        <p className="text-sm font-semibold leading-snug">
          The engine creates a draft invoice from completed trips, fixed monthly fees,
          and credits any reimbursable maintenance for the period.
        </p>
        <p className="text-xs text-violet-200 mt-2">
          Critical reconciliations are excluded. Re-running replaces an existing draft.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 px-4 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
        >
          Cancel
        </button>
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 px-5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-lg shadow-orange-500/30"
        >
          {isPending ? "Generating…" : "Generate draft invoice"}
        </Button>
      </div>
    </form>
  );
}
