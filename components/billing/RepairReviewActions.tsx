"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { approveRepairClaim, rejectRepairClaim } from "@/actions/repairs";

interface Props {
  claimId: string;
  subsidiaries: { id: string; name: string }[];
  defaultSubsidiaryId: string | null;
}

export function RepairReviewActions({ claimId, subsidiaries, defaultSubsidiaryId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [subsidiaryId, setSubsidiaryId] = useState(defaultSubsidiaryId ?? "");
  const [notes, setNotes] = useState("");

  function doApprove() {
    if (!subsidiaryId) {
      toast.error("Choose which subsidiary to bill.");
      return;
    }
    const fd = new FormData();
    fd.set("claim_id", claimId);
    fd.set("reimburse_subsidiary_id", subsidiaryId);
    fd.set("notes", notes);
    startTransition(async () => {
      const res = await approveRepairClaim(fd);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Claim approved — reimbursable credit created");
        router.refresh();
      }
    });
  }

  function doReject() {
    if (notes.trim().length < 3) {
      toast.error("Give a reason for rejecting.");
      return;
    }
    const fd = new FormData();
    fd.set("claim_id", claimId);
    fd.set("notes", notes);
    startTransition(async () => {
      const res = await rejectRepairClaim(fd);
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Claim rejected");
        router.refresh();
      }
    });
  }

  const selectCls =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30";

  if (mode === "none") {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setMode("approve")}
          className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm inline-flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4" /> Approve
        </button>
        <button
          onClick={() => setMode("reject")}
          className="h-11 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-sm inline-flex items-center justify-center gap-2"
        >
          <XCircle className="h-4 w-4" /> Reject
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mode === "approve" && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
            Bill / reimburse from subsidiary *
          </label>
          <select value={subsidiaryId} onChange={(e) => setSubsidiaryId(e.target.value)} className={selectCls}>
            <option value="">— select —</option>
            {subsidiaries.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
          {mode === "approve" ? "Notes (optional)" : "Reason for rejection *"}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={mode === "approve" ? doApprove : doReject}
          className={`flex-1 h-11 rounded-xl text-white font-bold text-sm disabled:opacity-50 ${
            mode === "approve" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
          }`}
        >
          {isPending ? "Working…" : mode === "approve" ? "Confirm approval" : "Confirm rejection"}
        </button>
        <button
          disabled={isPending}
          onClick={() => { setMode("none"); setNotes(""); }}
          className="h-11 px-4 rounded-xl border border-ink-200 text-ink-600 font-semibold text-sm hover:bg-ink-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
