"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { reviewLeave } from "@/actions/leave";

export function LeaveReviewButtons({ leaveId }: { leaveId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leave_id", leaveId);
      fd.set("decision", decision);
      const r = await reviewLeave(fd);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success(decision === "approved" ? "Leave approved" : "Leave rejected");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => decide("rejected")}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </button>
      <button
        onClick={() => decide("approved")}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </button>
    </div>
  );
}
