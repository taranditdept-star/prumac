"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { createJob } from "@/actions/jobs";

const CLASSES: [string, string][] = [
  ["truck", "Truck"], ["tanker", "Tanker"], ["minibus", "Minibus"], ["bakkie", "Bakkie"],
  ["suv", "SUV"], ["sedan", "Sedan"], ["farm_vehicle", "Farm vehicle"], ["specialist", "Specialist"],
];

export function JobForm({ subsidiaries }: { subsidiaries: { id: string; name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createJob(fd);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Job logged");
      router.push(`/dispatch/${r.data?.id}`);
    });
  }

  const field =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";
  const label = "block text-xs font-bold uppercase tracking-wide text-ink-500 mb-1.5";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink-900">Who is asking</h2>
        <div>
          <label className={label} htmlFor="subsidiary_id">Customer *</label>
          <select id="subsidiary_id" name="subsidiary_id" required className={field} defaultValue="">
            <option value="" disabled>Choose a customer…</option>
            {subsidiaries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="contact_name">Contact person</label>
            <input id="contact_name" name="contact_name" maxLength={120} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="contact_phone">Their phone</label>
            <input id="contact_phone" name="contact_phone" type="tel" inputMode="tel" maxLength={30} className={`${field} font-plate`} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-200/70 bg-white p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink-900">The job</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="pickup_label">Collecting from *</label>
            <input id="pickup_label" name="pickup_label" required maxLength={160} placeholder="e.g. Harare depot" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="dropoff_label">Going to *</label>
            <input id="dropoff_label" name="dropoff_label" required maxLength={160} placeholder="e.g. Gwanda site" className={field} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            {/* Drives the quote, so it is worth getting roughly right up front. */}
            <label className={label} htmlFor="distance_km">Distance (km)</label>
            <input id="distance_km" name="distance_km" type="number" step="0.1" min="0" inputMode="decimal" className={`${field} font-plate`} />
          </div>
          <div>
            <label className={label} htmlFor="load_count">Loads</label>
            <input id="load_count" name="load_count" type="number" min="0" step="1" inputMode="numeric" defaultValue={1} className={`${field} font-plate`} />
          </div>
          <div>
            <label className={label} htmlFor="vehicle_class">Vehicle needed</label>
            <select id="vehicle_class" name="vehicle_class" className={field} defaultValue="">
              <option value="">Any</option>
              {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="cargo_description">What is being carried</label>
          <input id="cargo_description" name="cargo_description" maxLength={500} placeholder="e.g. 30 tonnes of cement" className={field} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="required_at">Needed by</label>
            <input id="required_at" name="required_at" type="datetime-local" className={field} />
          </div>
          <label className="flex items-end gap-2.5 pb-2">
            <input id="is_urgent" name="is_urgent" type="checkbox" className="h-5 w-5 rounded border-ink-300 accent-orange-500" />
            <span className="text-sm font-semibold text-ink-800">Urgent — put it at the top of the board</span>
          </label>
        </div>
        <div>
          <label className={label} htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} maxLength={1000}
            className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
        </div>
      </section>

      <button
        type="submit" disabled={isPending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-sm font-bold text-white disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
        {isPending ? "Logging…" : "Log the job"}
      </button>
    </form>
  );
}
