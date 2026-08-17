"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PauseCircle, Ban, RotateCcw } from "lucide-react";
import { setUserAccess, type UserActionResult } from "@/actions/users";

/**
 * Suspend / Deactivate / Reactivate a driver from their profile page. Same
 * effect as the Accounts screen (bans the login + clears is_active), just where
 * a manager naturally looks. Admin-only, matching setUserAccess's guard.
 */
export function DriverAccessButton({
  profileId,
  driverName,
  active,
}: {
  profileId: string;
  driverName: string;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(p: Promise<UserActionResult>) {
    startTransition(async () => {
      const r = await p;
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Done");
        router.refresh();
      }
    });
  }

  function suspend() {
    const reason = prompt(
      `Suspend ${driverName}? They won't be able to log in or drive until you lift it.\n\nReason (shown on the account):`,
    );
    if (reason === null) return;
    run(setUserAccess(profileId, "suspended", reason));
  }
  function deactivate() {
    if (!confirm(`Deactivate ${driverName}? They will be unable to log in until reactivated.`)) return;
    run(setUserAccess(profileId, "deactivated"));
  }
  function reactivate() {
    if (!confirm(`Reactivate ${driverName}? They will be able to log in again.`)) return;
    run(setUserAccess(profileId, "active"));
  }

  const base =
    "inline-flex items-center gap-2 h-10 px-4 rounded-xl backdrop-blur border text-sm font-semibold transition-all disabled:opacity-50";

  if (active) {
    return (
      <>
        <button type="button" onClick={suspend} disabled={isPending} className={`${base} border-amber-300/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20`}>
          <PauseCircle className="h-4 w-4" /> Suspend
        </button>
        <button type="button" onClick={deactivate} disabled={isPending} className={`${base} border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20`}>
          <Ban className="h-4 w-4" /> Deactivate
        </button>
      </>
    );
  }
  return (
    <button type="button" onClick={reactivate} disabled={isPending} className={`${base} border-emerald-300/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25`}>
      <RotateCcw className="h-4 w-4" /> Reactivate
    </button>
  );
}
