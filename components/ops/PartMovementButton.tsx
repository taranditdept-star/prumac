"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownUp } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { recordPartMovement } from "@/actions/parts";
import type { CountryCode } from "@/types/domain";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

interface VehicleOption {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
}

export function PartMovementButton({
  part,
  vehicles,
}: {
  part: { id: string; name: string; unit: string; current_stock: number };
  vehicles: VehicleOption[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("part_id", part.id);
    startTransition(async () => {
      const r = await recordPartMovement(fd);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success("Stock updated");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
      >
        <ArrowDownUp className="h-3.5 w-3.5" />
        Stock
      </button>

      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={part.name}
        subtitle={`In stock: ${part.current_stock} ${part.unit}`}
        widthClass="w-full max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="movement_type">Movement *</Label>
            <select id="movement_type" name="movement_type" className={SELECT} defaultValue="out" required>
              <option value="in">Stock in (receive)</option>
              <option value="out">Stock out (issue / fit)</option>
              <option value="adjustment">Adjustment (signed)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" name="quantity" type="number" step="0.01" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit_cost">Unit cost</Label>
              <Input id="unit_cost" name="unit_cost" type="number" step="0.01" min="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicle_id">Fitted to vehicle</Label>
            <select id="vehicle_id" name="vehicle_id" className={SELECT} defaultValue="">
              <option value="">— none —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.plate_country})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" placeholder="Job card / invoice no." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isPending}>
              {isPending ? "Saving…" : "Record movement"}
            </Button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:underline">
              Cancel
            </button>
          </div>
        </form>
      </EditDrawer>
    </>
  );
}
