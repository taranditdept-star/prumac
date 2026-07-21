"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteJournalEntry } from "@/actions/finance";

export function DeleteJournalButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    if (!window.confirm("Delete this journal entry? This cannot be undone.")) return;
    startTransition(async () => {
      const r = await deleteJournalEntry(id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Journal entry deleted.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={isPending}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
      aria-label="Delete journal entry"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
