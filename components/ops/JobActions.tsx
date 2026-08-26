"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Calculator, UserCheck, ThumbsUp, ThumbsDown, XCircle } from "lucide-react";
import { quoteJob, assignJob, setJobDecision, cancelJob } from "@/actions/jobs";

export interface VehicleOption {
  id: string; plate_number: string; make: string; model: string;
  status: string; hasRate: boolean;
}
export interface DriverOption { id: string; name: string; employee_number: string | null }

const field =
  "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";
const label = "block text-xs font-bold uppercase tracking-wide text-ink-500 mb-1.5";

export function JobActions({
  jobId, status, distanceKm, loadCount, vehicles, drivers, currentVehicleId,
}: {
  jobId: string;
  status: string;
  distanceKm: number | null;
  loadCount: number | null;
  vehicles: VehicleOption[];
  drivers: DriverOption[];
  currentVehicleId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const run = (fn: (fd: FormData) => Promise<{ error: string } | { success: true; data?: unknown }>,
               fd: FormData, ok: string) =>
    startTransition(async () => {
      const r = await fn(fd);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(ok);
      router.refresh();
    });

  const submit = (
    e: React.FormEvent<HTMLFormElement>,
    fn: (fd: FormData) => Promise<{ error: string } | { success: true; data?: unknown }>,
    ok: string,
  ) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("job_id", jobId);
    run(fn, fd, ok);
  };

  const canQuote = ["requested", "quoted", "approved"].includes(status);
  const canDecide = ["quoted", "approved", "declined"].includes(status);
  const canAssign = ["approved", "assigned"].includes(status);
  const canCancel = !["completed", "cancelled", "in_progress"].includes(status);

  return (
    <div className="space-y-4">
      {canQuote && (
        <form onSubmit={(e) => submit(e, quoteJob, "Quote worked out")}
              className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Calculator className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink-900">Price the job</h3>
              <p className="text-[11px] text-ink-500">Uses the same rate card the invoice will use</p>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="q_vehicle">Price against vehicle</label>
            <select id="q_vehicle" name="vehicle_id" required className={field} defaultValue={currentVehicleId ?? ""}>
              <option value="" disabled>Choose a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} · {v.make} {v.model}{v.hasRate ? "" : " — no rate on file"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="q_distance">Distance (km)</label>
              <input id="q_distance" name="distance_km" type="number" step="0.1" min="0.1" required
                     inputMode="decimal" defaultValue={distanceKm ?? ""} className={`${field} font-plate`} />
            </div>
            <div>
              <label className={label} htmlFor="q_loads">Loads</label>
              <input id="q_loads" name="load_count" type="number" min="1" step="1" inputMode="numeric"
                     defaultValue={loadCount ?? 1} className={`${field} font-plate`} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="q_notes">Note on the quote</label>
            <input id="q_notes" name="quote_notes" maxLength={500} className={field} />
          </div>
          <button type="submit" disabled={isPending}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-bold text-white disabled:opacity-50">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Work out the price
          </button>
        </form>
      )}

      {canDecide && (
        <div className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-3">
          <h3 className="text-sm font-bold text-ink-900">Did the customer accept?</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button" disabled={isPending}
              onClick={() => { const fd = new FormData(); fd.set("job_id", jobId); fd.set("accepted", "1");
                               run(setJobDecision, fd, "Marked as approved"); }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
            >
              <ThumbsUp className="h-4 w-4" /> Accepted
            </button>
            <button
              type="button" disabled={isPending}
              onClick={() => { const fd = new FormData(); fd.set("job_id", jobId); fd.set("accepted", "0");
                               fd.set("reason", reason || "Customer declined the quote");
                               run(setJobDecision, fd, "Marked as declined"); }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink-200 text-sm font-bold text-ink-700 disabled:opacity-50"
            >
              <ThumbsDown className="h-4 w-4" /> Declined
            </button>
          </div>
        </div>
      )}

      {canAssign && (
        <form onSubmit={(e) => submit(e, assignJob, "Vehicle and driver assigned")}
              className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <UserCheck className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-ink-900">Allocate a truck</h3>
          </div>
          <div>
            <label className={label} htmlFor="a_vehicle">Vehicle</label>
            <select id="a_vehicle" name="vehicle_id" required className={field} defaultValue={currentVehicleId ?? ""}>
              <option value="" disabled>Choose a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} · {v.make} {v.model} ({v.status.replaceAll("_", " ")})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="a_driver">Driver</label>
            <select id="a_driver" name="driver_id" required className={field} defaultValue="">
              <option value="" disabled>Choose a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.employee_number ? ` · ${d.employee_number}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isPending}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-50">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Assign
          </button>
        </form>
      )}

      {canCancel && (
        <form onSubmit={(e) => submit(e, cancelJob, "Job cancelled")}
              className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-3">
          <h3 className="text-sm font-bold text-ink-900">Cancel this job</h3>
          <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder="Why is it being cancelled?" maxLength={300} className={field} />
          <button type="submit" disabled={isPending || !reason.trim()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> Cancel job
          </button>
        </form>
      )}
    </div>
  );
}
