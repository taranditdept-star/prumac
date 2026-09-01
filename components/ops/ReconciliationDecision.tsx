"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, PencilLine, Loader2 } from "lucide-react";
import { acceptReconciliation } from "@/actions/alerts";

/**
 * The two decision buttons on a flagged trip.
 *
 * They were both inert — plain <button type="button"> with no handler — on the
 * one screen where a manager is asked to make a billing judgement. Pressing
 * "Accept as-is" appeared to do something and changed nothing, so the same
 * trips stayed flagged and the alert count kept climbing.
 */
export function ReconciliationDecision({
  tripId,
  hasOpenAlert,
}: {
  tripId: string;
  hasOpenAlert: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept() {
    setError(null);
    start(async () => {
      const result = await acceptReconciliation(tripId, note);
      if ("error" in result) setError(result.error);
      else { setAsking(false); setNote(""); router.refresh(); }
    });
  }

  if (!hasOpenAlert) {
    return (
      <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm font-semibold text-emerald-800">
        <Check className="h-4 w-4" />
        Reviewed — this variance has been accepted
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {asking && (
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
          <label htmlFor="rec-note" className="block text-xs font-semibold text-ink-700 mb-1.5">
            Why is this variance acceptable? <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="rec-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. GPS lost signal in the Chimanimani hills"
            className="w-full h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => (asking ? accept() : setAsking(true))}
          disabled={pending}
          className="h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? "Saving…" : asking ? "Confirm — accept as-is" : "Accept as-is"}
        </button>

        {/* Adjusting billing means correcting the trip's figures, which is what
            the trip editor does. Sending them there beats a second, parallel
            way of changing the same numbers. */}
        <Link
          href={`/trips/${tripId}`}
          prefetch={false}
          className="h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-ink-200 hover:border-amber-300 hover:bg-amber-50 text-ink-900 text-sm font-semibold transition-all"
        >
          <PencilLine className="h-4 w-4" />
          Adjust the trip
        </Link>
      </div>

      {asking && !pending && (
        <button
          type="button"
          onClick={() => { setAsking(false); setError(null); }}
          className="text-xs font-semibold text-ink-400 hover:text-ink-700"
        >
          Cancel
        </button>
      )}
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
    </div>
  );
}
