"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { DriverForm } from "@/components/ops/DriverForm";
import type { DriverRow } from "@/types/domain";

interface DriverEditButtonProps {
  driver: DriverRow & {
    profile?: { full_name: string | null; phone: string | null; subsidiary_id: string | null };
  };
  driverName: string;
  subsidiaries: { id: string; name: string }[];
}

export function DriverEditButton({ driver, driverName, subsidiaries }: DriverEditButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 hover:bg-white/15 text-white text-sm font-semibold transition-all"
      >
        <Pencil className="h-4 w-4" />
        Edit driver
      </button>
      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Edit driver"
        subtitle={driverName}
      >
        <DriverForm driver={driver} subsidiaries={subsidiaries} />
      </EditDrawer>
    </>
  );
}
