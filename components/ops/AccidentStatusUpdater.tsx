"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ShieldCheck } from "lucide-react";
import { updateAccidentStatus } from "@/actions/accidents";

interface AccidentStatusUpdaterProps {
  accidentId: string;
  currentStatus: string;
}

export function AccidentStatusUpdater({ accidentId, currentStatus }: AccidentStatusUpdaterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");

  function submit(next: string, closeNotes: string | null) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("accident_id", accidentId);
      fd.set("status", next);
      if (closeNotes) fd.set("closed_notes", closeNotes);
      const r = await updateAccidentStatus(fd);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Status updated");
        setClosing(false);
        setNotes("");
        router.refresh();
      }
    });
  }

  if (currentStatus === "closed") {
    return (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center">
        <ShieldCheck className="h-5 w-5 text-emerald-600 mx-auto mb-1.5" />
        <p className="text-sm font-semibold text-emerald-800">Closed</p>
      </div>
    );
  }

  if (closing) {
    return (
      <div className="rounded-2xl bg-white border border-ink-200/70 p-5 space-y-3">
        <p className="text-sm font-semibold text-ink-900">Closing notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Insurance claim outcome, fault assignment, repair status…"
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit("closed", notes || null)}
            disabled={isPending}
            className="flex-1 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Confirm close"}
          </button>
          <button
            type="button"
            onClick={() => { setClosing(false); setNotes(""); }}
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
      {currentStatus === "reported" && (
        <button
          type="button"
          onClick={() => submit("investigating", null)}
          disabled={isPending}
          className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          Begin investigation
        </button>
      )}
      <button
        type="button"
        onClick={() => setClosing(true)}
        disabled={isPending}
        className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <ShieldCheck className="h-4 w-4" />
        Close case
      </button>
    </div>
  );
}
