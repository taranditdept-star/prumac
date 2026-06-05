"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ScanLine, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createPmPlan, completePmPlan, scanServiceDue } from "@/actions/maintenance";
import type { CountryCode } from "@/types/domain";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

interface VehicleOption {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
}

export function ScanDueButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const r = await scanServiceDue();
          if ("error" in r) toast.error(r.error);
          else toast.success(`${r.data?.raised ?? 0} new alert(s) raised`);
        })
      }
      disabled={isPending}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-ink-200 bg-white text-ink-700 text-sm font-semibold hover:bg-ink-50 transition-all disabled:opacity-60"
    >
      <ScanLine className="h-4 w-4" />
      {isPending ? "Scanning…" : "Run due scan"}
    </button>
  );
}

export function CompletePmButton({ planId }: { planId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("plan_id", planId);
          const r = await completePmPlan(fd);
          if (r && "error" in r) toast.error(r.error);
          else toast.success("Marked done");
        })
      }
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
    >
      <Check className="h-3.5 w-3.5" />
      Done
    </button>
  );
}

export function PmPlanForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const r = await createPmPlan(fd);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success("Recurring task added");
        form.reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 shadow-sm transition-all"
      >
        <Plus className="h-4 w-4" />
        Add recurring task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vehicle_id">Vehicle *</Label>
          <select id="vehicle_id" name="vehicle_id" className={SELECT} required defaultValue="">
            <option value="" disabled>
              Select vehicle…
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number} ({v.plate_country}) — {v.make} {v.model}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task_name">Task *</Label>
          <Input id="task_name" name="task_name" placeholder="Engine oil & filter" required />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="interval_km">Every (km)</Label>
          <Input id="interval_km" name="interval_km" type="number" min={1} placeholder="5000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="interval_days">Every (days)</Label>
          <Input id="interval_days" name="interval_days" type="number" min={1} placeholder="180" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_done_km">Last done (km)</Label>
          <Input id="last_done_km" name="last_done_km" type="number" min={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_done_at">Last done (date)</Label>
          <Input id="last_done_at" name="last_done_at" type="date" />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isPending}>
          {isPending ? "Saving…" : "Add task"}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
