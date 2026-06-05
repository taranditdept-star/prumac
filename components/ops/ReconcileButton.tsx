"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { reconcileTrip } from "@/actions/trips";

export function ReconcileButton({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await reconcileTrip(tripId);
      if ("error" in result) toast.error(result.error);
      else {
        toast.success("Reconciliation re-run");
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={isPending}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-ink-200 hover:border-orange-300 hover:bg-orange-50 text-ink-900 text-sm font-semibold transition-all disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 text-orange-600 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Recomputing…" : "Re-run reconciliation"}
    </button>
  );
}
