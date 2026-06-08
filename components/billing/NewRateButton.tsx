"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { RateForm } from "@/components/billing/RateForm";

interface NewRateButtonProps {
  vehicles: { id: string; label: string }[];
  subsidiaries: { id: string; name: string }[];
}

export function NewRateButton({ vehicles, subsidiaries }: NewRateButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 transition-all"
      >
        <Plus className="h-4 w-4" />
        New rate
      </button>
      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="New billing rate"
        subtitle="Set pricing for a vehicle"
        widthClass="w-full max-w-lg"
      >
        <RateForm
          vehicles={vehicles}
          subsidiaries={subsidiaries}
          onDone={() => setOpen(false)}
        />
      </EditDrawer>
    </>
  );
}
