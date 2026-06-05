"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { recordTyreEvent } from "@/actions/tyres";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring";

export function TyreEventButton({
  tyre,
}: {
  tyre: { id: string; label: string; vehicle_id: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("tyre_id", tyre.id);
    if (tyre.vehicle_id) fd.set("vehicle_id", tyre.vehicle_id);
    startTransition(async () => {
      const r = await recordTyreEvent(fd);
      if (r && "error" in r) toast.error(r.error);
      else {
        toast.success("Event recorded");
        setOpen(false);
        router.refresh();
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        Event
      </button>

      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={tyre.label}
        subtitle="Record a lifecycle event"
        widthClass="w-full max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event_type">Event *</Label>
            <select id="event_type" name="event_type" className={SELECT} defaultValue="inspected" required>
              <option value="inspected">Inspected (tread reading)</option>
              <option value="rotated">Rotated (new position)</option>
              <option value="removed">Removed (back to store)</option>
              <option value="scrapped">Scrapped</option>
              <option value="fitted">Fitted</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="occurred_at">Date *</Label>
              <Input id="occurred_at" name="occurred_at" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Position</Label>
              <Input id="position" name="position" placeholder="FL, RR1…" className="font-plate" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="odometer_km">Odometer (km)</Label>
              <Input id="odometer_km" name="odometer_km" type="number" min={0} className="font-plate" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tread_depth_mm">Tread (mm)</Label>
              <Input id="tread_depth_mm" name="tread_depth_mm" type="number" step="0.1" min="0" max="40" />
            </div>
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
              {isPending ? "Saving…" : "Record event"}
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
