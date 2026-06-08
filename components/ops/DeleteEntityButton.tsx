"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { deleteVehicle } from "@/actions/vehicles";
import { deleteDriver } from "@/actions/drivers";

interface DeleteEntityButtonProps {
  entity: "vehicle" | "driver";
  id: string;
  label: string;
  redirectTo: string;
}

export function DeleteEntityButton({ entity, id, label, redirectTo }: DeleteEntityButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result =
        entity === "vehicle" ? await deleteVehicle(id) : await deleteDriver(id);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${entity === "vehicle" ? "Vehicle" : "Driver"} deleted`);
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-50 text-rose-700 text-sm font-semibold transition-all"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </button>
      <EditDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${entity}`}
        subtitle={label}
        widthClass="w-full max-w-md"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl bg-rose-50 border border-rose-200 p-4">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm text-rose-800">
              <p className="font-semibold">This permanently deletes the {entity}.</p>
              <p className="mt-1 text-rose-700">
                It only works if the {entity} has no history. If it has{" "}
                {entity === "vehicle"
                  ? "trips, rates or invoices"
                  : "trips or incident records"}
                , the delete is blocked — {entity === "vehicle" ? "decommission" : "deactivate"} it
                instead.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 px-4 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-lg shadow-rose-500/30 transition-all disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {isPending ? "Deleting…" : `Delete ${entity}`}
            </button>
          </div>
        </div>
      </EditDrawer>
    </>
  );
}
