"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { requestLeave, cancelLeave } from "@/actions/leave";
import { LEAVE_TYPES } from "@/lib/validation/leave";

const SELECT =
  "flex h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200";
const INPUT =
  "flex h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200";

export function LeaveRequestForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const r = await requestLeave(fd);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success("Leave request submitted");
        form.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-ink-900 text-white font-bold text-sm active:scale-[0.98] transition-transform"
      >
        <CalendarPlus className="h-5 w-5" />
        Request leave
      </button>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl bg-white border border-ink-200/70 p-4 space-y-3">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-ink-400 font-bold">Leave type</label>
        <select name="leave_type" className={`${SELECT} mt-1 capitalize`} defaultValue="annual">
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t} className="capitalize">
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-ink-400 font-bold">From</label>
          <input name="start_date" type="date" min={today} defaultValue={today} required className={`${INPUT} mt-1`} />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-ink-400 font-bold">To</label>
          <input name="end_date" type="date" min={today} defaultValue={today} required className={`${INPUT} mt-1`} />
        </div>
      </div>
      <div>
        <label className="text-[11px] uppercase tracking-wide text-ink-400 font-bold">Reason (optional)</label>
        <textarea
          name="reason"
          rows={2}
          className="mt-1 flex w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 h-11 rounded-xl bg-orange-500 text-white font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {isPending ? "Submitting…" : "Submit request"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-11 px-4 rounded-xl border border-ink-200 text-ink-600 font-semibold text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CancelLeaveButton({ leaveId }: { leaveId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("leave_id", leaveId);
          const r = await cancelLeave(fd);
          if (r && "error" in r) toast.error(r.error);
          else {
            toast.success("Request cancelled");
            router.refresh();
          }
        })
      }
      disabled={isPending}
      className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-60"
    >
      Cancel
    </button>
  );
}
