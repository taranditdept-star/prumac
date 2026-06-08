"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { createRate, updateRate } from "@/actions/rates";
import { BILLING_MODES } from "@/lib/validation/rate";

export interface RateEditRow {
  id: string;
  mode: string;
  rate_amount: number;
  currency: string;
  radius_km: number | null;
  effective_from: string;
  vehicleLabel: string;
  subsidiaryLabel: string;
}

interface RateFormProps {
  /** Present → supersede an existing rate. Absent → create a new rate. */
  rate?: RateEditRow;
  vehicles?: { id: string; label: string }[];
  subsidiaries?: { id: string; name: string }[];
  onDone?: () => void;
}

const modeLabels: Record<string, string> = {
  per_km: "Per km",
  per_litre_100km: "Per L per 100 km",
  per_load: "Per load",
  fixed_monthly: "Fixed monthly",
};

export function RateForm({ rate, vehicles, subsidiaries, onDone }: RateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!rate;
  const today = new Date().toISOString().split("T")[0];
  const [mode, setMode] = useState<string>(rate?.mode ?? "per_km");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = isEdit ? await updateRate(fd) : await createRate(fd);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Rate updated (superseded)" : "Rate created");
      router.refresh();
      onDone?.();
    });
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/40 transition-all";
  const selectCls = inputCls + " appearance-none cursor-pointer";
  const labelCls = "text-xs font-bold uppercase tracking-[0.1em] text-ink-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isEdit ? (
        <>
          <input type="hidden" name="rate_id" value={rate!.id} />
          <div className="rounded-xl bg-ink-50 border border-ink-200 p-4 space-y-1">
            <p className="text-sm font-semibold text-ink-900">{rate!.vehicleLabel}</p>
            <p className="text-xs text-ink-500">{rate!.subsidiaryLabel}</p>
            <p className="text-xs text-ink-500">
              Mode: <span className="font-semibold">{modeLabels[rate!.mode] ?? rate!.mode}</span> ·
              current {rate!.currency} {Number(rate!.rate_amount).toFixed(4)}
            </p>
          </div>
          <p className="text-xs text-ink-500 -mt-1">
            Saving closes the current rate and starts a new one from the date below. Past invoices
            keep their original pricing.
          </p>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className={labelCls}>Vehicle *</Label>
            <select name="vehicle_id" className={selectCls} required defaultValue="">
              <option value="">— select a vehicle —</option>
              {(vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelCls}>Applies to subsidiary</Label>
            <select name="subsidiary_id" className={selectCls} defaultValue="">
              <option value="">All subsidiaries (default)</option>
              {(subsidiaries ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelCls}>Mode *</Label>
            <select
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={selectCls}
              required
            >
              {BILLING_MODES.map((m) => (
                <option key={m} value={m}>
                  {modeLabels[m] ?? m}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={labelCls}>Rate amount *</Label>
          <input
            name="rate_amount"
            type="number"
            min={0}
            step="0.0001"
            defaultValue={rate ? Number(rate.rate_amount) : ""}
            className={inputCls + " font-plate"}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelCls}>Currency *</Label>
          <input
            name="currency"
            defaultValue={rate?.currency ?? "USD"}
            className={inputCls + " font-plate uppercase"}
            required
          />
        </div>
      </div>

      {mode === "per_load" && (
        <div className="space-y-1.5">
          <Label className={labelCls}>Radius (km) *</Label>
          <input
            name="radius_km"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={rate?.radius_km ?? ""}
            className={inputCls + " font-plate"}
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className={labelCls}>Effective from *</Label>
        <input
          name="effective_from"
          type="date"
          defaultValue={isEdit ? today : today}
          className={inputCls + " font-plate"}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label className={labelCls}>Notes</Label>
        <input name="notes" placeholder="Optional context" className={inputCls} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50"
      >
        {isPending ? "Saving…" : isEdit ? "Supersede rate" : "Create rate"}
      </button>
    </form>
  );
}
