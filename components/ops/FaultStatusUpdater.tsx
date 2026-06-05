"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Wrench, XCircle, ShieldCheck } from "lucide-react";
import { updateFaultStatus } from "@/actions/faults";

interface FaultStatusUpdaterProps {
  faultId: string;
  currentStatus: string;
}

const TRANSITIONS: Record<string, { next: string; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }[]> = {
  reported: [
    { next: "acknowledged", label: "Acknowledge", icon: ShieldCheck, tone: "bg-violet-500 hover:bg-violet-600" },
    { next: "in_repair", label: "Send to repair", icon: Wrench, tone: "bg-amber-500 hover:bg-amber-600" },
    { next: "wont_fix", label: "Won't fix", icon: XCircle, tone: "bg-ink-500 hover:bg-ink-600" },
  ],
  acknowledged: [
    { next: "in_repair", label: "Send to repair", icon: Wrench, tone: "bg-amber-500 hover:bg-amber-600" },
    { next: "resolved", label: "Mark resolved", icon: CheckCircle2, tone: "bg-emerald-500 hover:bg-emerald-600" },
    { next: "wont_fix", label: "Won't fix", icon: XCircle, tone: "bg-ink-500 hover:bg-ink-600" },
  ],
  in_repair: [
    { next: "resolved", label: "Mark resolved", icon: CheckCircle2, tone: "bg-emerald-500 hover:bg-emerald-600" },
  ],
};

export function FaultStatusUpdater({ faultId, currentStatus }: FaultStatusUpdaterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState<string | null>(null);

  const transitions = TRANSITIONS[currentStatus] ?? [];

  function handleClick(next: string) {
    if (next === "resolved" || next === "wont_fix") {
      setShowNotes(next);
      return;
    }
    submit(next, null);
  }

  function submit(next: string, notesValue: string | null) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("fault_id", faultId);
      fd.set("status", next);
      if (notesValue) fd.set("notes", notesValue);
      const r = await updateFaultStatus(fd);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Status updated");
        setShowNotes(null);
        setNotes("");
        router.refresh();
      }
    });
  }

  if (transitions.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1.5" />
        <p className="text-sm font-semibold text-emerald-800">Closed</p>
        <p className="text-xs text-emerald-600 mt-0.5">No further actions available.</p>
      </div>
    );
  }

  if (showNotes) {
    return (
      <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
        <p className="text-sm font-semibold text-ink-900">
          {showNotes === "resolved" ? "Resolution notes" : "Reason for closing"}
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What was done? Parts replaced, service centre, etc."
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit(showNotes, notes || null)}
            disabled={isPending}
            className={`flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 ${
              showNotes === "resolved" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-ink-500 hover:bg-ink-600"
            }`}
          >
            {isPending ? "Saving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => { setShowNotes(null); setNotes(""); }}
            className="px-4 text-sm text-ink-500 hover:text-ink-900"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold mb-2">
        Update status
      </p>
      {transitions.map((t) => (
        <button
          key={t.next}
          type="button"
          onClick={() => handleClick(t.next)}
          disabled={isPending}
          className={`w-full h-11 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${t.tone}`}
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </button>
      ))}
    </div>
  );
}
