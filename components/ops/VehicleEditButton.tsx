"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { VehicleForm } from "@/components/ops/VehicleForm";
import type { VehicleRow } from "@/types/domain";

interface VehicleEditButtonProps {
  vehicle: VehicleRow;
  subsidiaries: { id: string; name: string }[];
}

export function VehicleEditButton({ vehicle, subsidiaries }: VehicleEditButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-ink-200 hover:border-orange-300 hover:bg-orange-50 text-ink-900 text-sm font-semibold transition-all"
      >
        <Pencil className="h-4 w-4 text-orange-600" />
        Edit vehicle
      </button>
      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Edit vehicle"
        subtitle={`${vehicle.make} ${vehicle.model} · ${vehicle.plate_number}`}
      >
        <VehicleForm vehicle={vehicle} subsidiaries={subsidiaries} />
      </EditDrawer>
    </>
  );
}
