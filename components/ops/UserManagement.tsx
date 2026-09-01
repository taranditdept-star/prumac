"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, ShieldCheck, KeyRound, Copy, Check, X, Ban, RotateCcw, PauseCircle } from "lucide-react";
import {
  createDriverLogin,
  createStaffLogin,
  resetUserPassword,
  setUserAccess,
  type UserActionResult,
} from "@/actions/users";
import type { AppRole } from "@/types/domain";

export interface AccountRow {
  id: string;
  name: string;
  role: AppRole;
  identifier: string;
  active: boolean;
  onboardingPending: boolean;
  isDriver: boolean;
  accessStatus: "active" | "suspended" | "deactivated";
  accessReason: string | null;
}

interface Subsidiary {
  id: string;
  name: string;
}

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  fleet_manager: "Fleet manager",
  subsidiary_billing: "Billing",
  driver: "Driver",
};
const ROLE_STYLE: Record<AppRole, string> = {
  admin: "bg-rose-50 text-rose-700 ring-rose-200",
  fleet_manager: "bg-orange-50 text-orange-700 ring-orange-200",
  subsidiary_billing: "bg-violet-50 text-violet-700 ring-violet-200",
  driver: "bg-sky-50 text-sky-700 ring-sky-200",
};

const inputClass =
  "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

export function UserManagement({ accounts, subsidiaries }: { accounts: AccountRow[]; subsidiaries: Subsidiary[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"driver" | "staff" | null>(null);
  const [creds, setCreds] = useState<{ username?: string; password?: string } | null>(null);

  function handle(result: Promise<UserActionResult>, onOk?: () => void) {
    startTransition(async () => {
      const r = await result;
      if ("error" in r) {
        toast.error(r.error);
      } else {
        if (r.password) setCreds({ username: r.username, password: r.password });
        else toast.success("Done");
        onOk?.();
        router.refresh();
      }
    });
  }

  function submitDriver(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handle(createDriverLogin(new FormData(e.currentTarget)), () => setMode(null));
  }
  function submitStaff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handle(createStaffLogin(new FormData(e.currentTarget)), () => setMode(null));
  }
  function reset(a: AccountRow) {
    if (!confirm(`Reset the password for ${a.name}? Their current password will stop working.`)) return;
    handle(resetUserPassword(a.id));
  }
  function suspend(a: AccountRow) {
    const reason = prompt(`Suspend ${a.name}? They won't be able to log in until you lift it.\n\nReason (shown on the account):`);
    if (reason === null) return; // cancelled
    handle(setUserAccess(a.id, "suspended", reason));
  }
  function deactivate(a: AccountRow) {
    if (!confirm(`Deactivate ${a.name}? They will be unable to log in until reactivated.`)) return;
    handle(setUserAccess(a.id, "deactivated"));
  }
  function reactivate(a: AccountRow) {
    if (!confirm(`Reactivate ${a.name}? They will be able to log in again.`)) return;
    handle(setUserAccess(a.id, "active"));
  }

  return (
    <div className="space-y-5">
      {/* Credential reveal */}
      {creds && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-900">Credentials ready — copy them now</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                The password is shown only once and can&apos;t be retrieved later. Give it to the user securely.
              </p>
            </div>
            <button onClick={() => setCreds(null)} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <CredField label="Username" value={creds.username ?? ""} />
            <CredField label="Password" value={creds.password ?? ""} />
          </div>
        </div>
      )}

      {/* Create buttons / forms */}
      {mode === null ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("driver")}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
          >
            <UserPlus className="h-4 w-4" /> New driver login
          </button>
          <button
            type="button"
            onClick={() => setMode("staff")}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-bold text-ink-800 hover:bg-ink-50"
          >
            <ShieldCheck className="h-4 w-4" /> New staff login
          </button>
        </div>
      ) : mode === "driver" ? (
        <form onSubmit={submitDriver} className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <p className="mb-3 text-sm font-bold text-ink-900">New driver login</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Full name</span>
              <input name="full_name" required placeholder="e.g. Tendai Moyo" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Subsidiary (optional)</span>
              <select name="subsidiary_id" className={inputClass} defaultValue="">
                <option value="">—</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            A driver ID (PMD…) and password are generated. The driver completes their licence on first sign-in.
          </p>
          <FormButtons isPending={isPending} onCancel={() => setMode(null)} submitLabel="Create driver" />
        </form>
      ) : (
        <form onSubmit={submitStaff} className="rounded-2xl border border-ink-200/70 bg-white p-5">
          <p className="mb-3 text-sm font-bold text-ink-900">New staff login</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Full name</span>
              <input name="full_name" required placeholder="e.g. Rumbi Chikore" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Email</span>
              <input name="email" type="email" required placeholder="name@prumac.zw" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Role</span>
              <select name="role" className={inputClass} defaultValue="fleet_manager">
                <option value="fleet_manager">Fleet manager</option>
                <option value="subsidiary_billing">Billing (subsidiary)</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Subsidiary (billing role)</span>
              <select name="subsidiary_id" className={inputClass} defaultValue="">
                <option value="">—</option>
                {subsidiaries.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <FormButtons isPending={isPending} onCancel={() => setMode(null)} submitLabel="Create staff" />
        </form>
      )}

      {/* Account list */}
      {/* overflow-x-auto, not overflow-hidden: this table has six columns
          including an Actions cell, and on a phone the last two were simply
          cut off with no way to reach them. */}
      <div className="overflow-x-auto rounded-2xl border border-ink-200/70 bg-white">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-[11px] uppercase tracking-wider text-ink-400">
              <th className="px-4 py-2.5 font-bold">Name</th>
              <th className="px-4 py-2.5 font-bold">Role</th>
              <th className="px-4 py-2.5 font-bold">Login</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {accounts.map((a) => (
              <tr key={a.id} className={a.active ? "" : "bg-ink-50/40"}>
                <td className="px-4 py-3 font-semibold text-ink-900">{a.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-bold ring-1 ${ROLE_STYLE[a.role]}`}>
                    {ROLE_LABEL[a.role]}
                  </span>
                </td>
                <td className="px-4 py-3 font-plate text-ink-700">{a.identifier}</td>
                <td className="px-4 py-3">
                  {a.active ? (
                    a.onboardingPending ? (
                      <span className="text-xs font-semibold text-amber-600">Onboarding pending</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                      </span>
                    )
                  ) : a.accessStatus === "suspended" ? (
                    <div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                        <PauseCircle className="h-3.5 w-3.5" /> Suspended
                      </span>
                      {a.accessReason && (
                        <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-ink-400" title={a.accessReason}>
                          {a.accessReason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-semibold text-ink-400">Deactivated</span>
                      {a.accessReason && (
                        <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-ink-400" title={a.accessReason}>
                          {a.accessReason}
                        </p>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => reset(a)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Reset
                    </button>
                    {a.active ? (
                      <>
                        <button
                          type="button"
                          onClick={() => suspend(a)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          <PauseCircle className="h-3.5 w-3.5" /> Suspend
                        </button>
                        <button
                          type="button"
                          onClick={() => deactivate(a)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Ban className="h-3.5 w-3.5" /> Deactivate
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivate(a)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormButtons({ isPending, onCancel, submitLabel }: { isPending: boolean; onCancel: () => void; submitLabel: string }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {isPending ? "Creating…" : submitLabel}
      </button>
      <button type="button" onClick={onCancel} className="px-3 py-2.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        Cancel
      </button>
    </div>
  );
}

function CredField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        toast.success(`${label} copied`);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Copy failed"),
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{label}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <code className="truncate font-plate text-sm font-bold text-ink-900">{value}</code>
        <button type="button" onClick={copy} className="shrink-0 rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50" aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
