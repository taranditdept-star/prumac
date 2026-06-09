"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Gauge, ScrollText } from "lucide-react";
import { updateThresholds, publishTerms } from "@/actions/settings";

export function ThresholdsForm({ odometerThreshold }: { odometerThreshold: number }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updateThresholds(fd);
      if ("error" in r) toast.error(r.error);
      else toast.success("Settings saved.");
    });
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 ring-1 ring-sky-100">
          <Gauge className="h-4 w-4 text-sky-600" />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">Operational thresholds</h2>
          <p className="text-xs text-ink-500">Tune how the system flags anomalies.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Odometer jump threshold (km)
          </label>
          <p className="mb-1.5 text-xs text-ink-400">
            A start reading higher than the last known by more than this raises an odometer-mismatch alert.
          </p>
          <input
            name="odometer_jump_threshold_km"
            type="number"
            min={0}
            max={100000}
            step={50}
            required
            defaultValue={odometerThreshold}
            className="w-40 rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-plate text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save thresholds"}
        </button>
      </form>
    </section>
  );
}

export function TermsForm({
  title,
  body,
  version,
}: {
  title: string;
  body: string;
  version: number | null;
}) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await publishTerms(fd);
      if ("error" in r) toast.error(r.error);
      else toast.success("New terms published. Drivers re-accept on their next trip.");
    });
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 ring-1 ring-violet-100">
          <ScrollText className="h-4 w-4 text-violet-600" />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">Trip terms &amp; conditions</h2>
          <p className="text-xs text-ink-500">
            Shown to drivers before each trip.{" "}
            {version != null && <span className="font-semibold">Current: v{version}</span>}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">Title</label>
          <input
            name="title"
            type="text"
            defaultValue={title}
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Terms text (Markdown)
          </label>
          <textarea
            name="body_md"
            rows={12}
            defaultValue={body}
            required
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {isPending ? "Publishing…" : "Publish new version"}
          </button>
          <p className="text-xs text-ink-400">Publishing supersedes the current version.</p>
        </div>
      </form>
    </section>
  );
}
