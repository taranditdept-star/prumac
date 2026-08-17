"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight, Pencil, Truck, Unlink, PauseCircle, Ban, RotateCcw, KeyRound, Trash2, Copy, Check,
} from "lucide-react";
import { RowMenu, type RowAction } from "@/components/primitives/RowMenu";
import { EditDrawer } from "@/components/primitives/EditDrawer";
import { DriverForm } from "@/components/ops/DriverForm";
import { assignVehicle, endAssignment, deleteDriver } from "@/actions/drivers";
import { setUserAccess, resetUserPassword } from "@/actions/users";
import type { DriverRow } from "@/types/domain";

interface VehicleOption {
  id: string;
  plate_number: string;
  make: string;
  model: string;
  holder: string | null;
}

interface DriverRowActionsProps {
  driver: DriverRow & { profile?: { full_name: string | null; phone: string | null; subsidiary_id: string | null } };
  driverName: string;
  profileId: string;
  accessStatus: "active" | "suspended" | "deactivated";
  currentAssignmentId: string | null;
  currentVehicleLabel: string | null;
  vehicles: VehicleOption[];
  subsidiaries: { id: string; name: string }[];
  isAdmin: boolean;
}

type Drawer = null | "edit" | "assign" | "delete" | "creds";

export function DriverRowActions(props: DriverRowActionsProps) {
  const { driver, driverName, profileId, accessStatus, currentAssignmentId, currentVehicleLabel, isAdmin } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [creds, setCreds] = useState<{ username?: string; password?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const active = accessStatus === "active" && driver.is_active;

  function run(fn: () => Promise<unknown>, okMsg: string) {
    startTransition(async () => {
      const r = (await fn()) as { error?: string } | undefined;
      if (r?.error) toast.error(r.error);
      else {
        toast.success(okMsg);
        setDrawer(null);
        router.refresh();
      }
    });
  }

  function doAssign() {
    if (!vehicleId) {
      toast.error("Pick a vehicle first.");
      return;
    }
    const fd = new FormData();
    fd.set("driver_id", driver.id);
    fd.set("vehicle_id", vehicleId);
    run(() => assignVehicle(fd), "Vehicle assigned");
  }

  function doReset() {
    startTransition(async () => {
      const r = await resetUserPassword(profileId);
      if ("error" in r) toast.error(r.error);
      else {
        setCreds({ username: r.username, password: r.password });
        setDrawer("creds");
      }
    });
  }

  function suspend() {
    const reason = prompt(`Suspend ${driverName}? They can't log in or drive until you lift it.\n\nReason:`);
    if (reason === null) return;
    run(() => setUserAccess(profileId, "suspended", reason), `${driverName} suspended`);
  }

  const ic = "h-4 w-4";
  const actions: RowAction[] = [
    { key: "view", label: "Open driver", icon: <ArrowUpRight className={ic} />, href: `/drivers/${driver.id}` },
    { key: "edit", label: "Edit driver", icon: <Pencil className={ic} />, onSelect: () => setDrawer("edit") },
    {
      key: "assign",
      label: currentVehicleLabel ? "Reassign vehicle" : "Assign vehicle",
      icon: <Truck className={ic} />,
      separatorBefore: true,
      hint: currentVehicleLabel ?? undefined,
      onSelect: () => setDrawer("assign"),
    },
  ];

  if (currentAssignmentId) {
    actions.push({
      key: "unassign",
      label: "End assignment",
      icon: <Unlink className={ic} />,
      tone: "warn",
      onSelect: () => run(() => endAssignment(currentAssignmentId), "Assignment ended"),
    });
  }

  if (isAdmin) {
    actions.push({ key: "reset", label: "Reset password", icon: <KeyRound className={ic} />, separatorBefore: true, onSelect: doReset });
    if (active) {
      actions.push(
        { key: "suspend", label: "Suspend driver", icon: <PauseCircle className={ic} />, tone: "warn", hint: "Blocks login", onSelect: suspend },
        { key: "deactivate", label: "Deactivate driver", icon: <Ban className={ic} />, tone: "danger", onSelect: () => run(() => setUserAccess(profileId, "deactivated"), `${driverName} deactivated`) },
      );
    } else {
      actions.push({ key: "reactivate", label: "Reactivate driver", icon: <RotateCcw className={ic} />, onSelect: () => run(() => setUserAccess(profileId, "active"), `${driverName} reactivated`) });
    }
    actions.push({ key: "delete", label: "Delete driver", icon: <Trash2 className={ic} />, tone: "danger", hint: "Only if no history", separatorBefore: true, onSelect: () => setDrawer("delete") });
  }

  return (
    <>
      <RowMenu actions={actions} busy={isPending} ariaLabel={`Actions for ${driverName}`} />

      <EditDrawer open={drawer === "edit"} onClose={() => setDrawer(null)} title="Edit driver" subtitle={driverName}>
        <DriverForm driver={driver} subsidiaries={props.subsidiaries} />
      </EditDrawer>

      <EditDrawer
        open={drawer === "assign"}
        onClose={() => setDrawer(null)}
        title={currentVehicleLabel ? "Reassign vehicle" : "Assign vehicle"}
        subtitle={driverName}
        widthClass="w-full max-w-lg"
      >
        <div className="space-y-3">
          {currentVehicleLabel && (
            <p className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-600">
              Currently holding <span className="font-bold text-ink-900">{currentVehicleLabel}</span> — assigning a new
              vehicle ends that assignment.
            </p>
          )}
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Vehicle</span>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="">Choose a vehicle…</option>
              {props.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} — {v.make} {v.model}
                  {v.holder ? ` (held by ${v.holder})` : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-ink-500">Assigning a vehicle held by someone else ends their assignment too.</p>
          <button
            type="button"
            onClick={doAssign}
            disabled={isPending}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {isPending ? "Assigning…" : "Confirm assignment"}
          </button>
        </div>
      </EditDrawer>

      <EditDrawer open={drawer === "delete"} onClose={() => setDrawer(null)} title="Delete driver" subtitle={driverName} widthClass="w-full max-w-lg">
        <div className="space-y-3">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            This permanently removes <span className="font-bold">{driverName}</span>. It only works if they have no trip,
            assignment or incident history — otherwise deactivate them instead.
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => deleteDriver(driver.id), `${driverName} deleted`)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </EditDrawer>

      <EditDrawer
        open={drawer === "creds"}
        onClose={() => {
          setDrawer(null);
          setCreds(null);
          router.refresh();
        }}
        title="New password"
        subtitle={driverName}
        widthClass="w-full max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Copy this now — it is shown only once and their old password no longer works.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Username</p>
              <code className="font-plate text-sm font-bold text-ink-900">{creds?.username ?? "—"}</code>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Password</p>
              <code className="font-plate text-sm font-bold text-ink-900">{creds?.password ?? "—"}</code>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const text = `${creds?.username ?? ""} / ${creds?.password ?? ""}`;
              navigator.clipboard?.writeText(text).then(
                () => {
                  setCopied(true);
                  toast.success("Copied");
                  setTimeout(() => setCopied(false), 1500);
                },
                () => toast.error("Copy failed"),
              );
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-ink-200 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy both
          </button>
        </div>
      </EditDrawer>
    </>
  );
}
