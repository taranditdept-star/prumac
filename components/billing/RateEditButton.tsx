"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { RateForm, type RateEditRow } from "@/components/billing/RateForm";

export function RateEditButton({ rate }: { rate: RateEditRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-ink-200 hover:border-orange-300 hover:bg-orange-50 text-ink-700 text-xs font-semibold transition-all"
      >
        <Pencil className="h-3.5 w-3.5 text-orange-600" />
        Edit
      </button>
      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Edit billing rate"
        subtitle="Supersede with a new effective-dated rate"
        widthClass="w-full max-w-lg"
      >
        <RateForm rate={rate} onDone={() => setOpen(false)} />
      </EditDrawer>
    </>
  );
}
