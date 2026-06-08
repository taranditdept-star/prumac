"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Ban } from "lucide-react";
import { cancelHandover, rejectHandover } from "@/actions/handovers";

export function CancelHandoverButton({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const res = await cancelHandover(handoverId);
          if ("error" in res) toast.error(res.error);
          else {
            toast.success("Handover cancelled");
            router.push("/handover");
            router.refresh();
          }
        })
      }
      disabled={isPending}
      className="w-full h-12 rounded-2xl border border-ink-200 bg-white text-ink-700 font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-ink-50 disabled:opacity-50"
    >
      <Ban className="h-4 w-4" /> {isPending ? "Cancelling…" : "Cancel handover"}
    </button>
  );
}

export function RejectTakeoverButton({ handoverId }: { handoverId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full h-12 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-rose-100"
      >
        <X className="h-4 w-4" /> Reject — vehicle not as described
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why are you rejecting? (e.g. damage not noted)"
        className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
      />
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await rejectHandover(handoverId, reason);
              if ("error" in res) toast.error(res.error);
              else {
                toast.success("Handover rejected");
                router.push("/handover");
                router.refresh();
              }
            })
          }
          className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm disabled:opacity-50"
        >
          {isPending ? "Rejecting…" : "Confirm rejection"}
        </button>
        <button
          onClick={() => { setOpen(false); setReason(""); }}
          className="h-11 px-4 rounded-xl border border-ink-200 text-ink-600 font-semibold text-sm hover:bg-white"
        >
          Back
        </button>
      </div>
    </div>
  );
}
