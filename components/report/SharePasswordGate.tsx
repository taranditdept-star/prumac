"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { unlockAccidentShare } from "@/actions/accident-share";

/**
 * The password gate for a shared accident report. The recipient has no app
 * account — this password IS the credential, verified server-side.
 */
export function SharePasswordGate({ token, recipient }: { token: string; recipient: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await unlockAccidentShare(token, password);
      if ("error" in r) setError(r.error);
      else {
        setPassword("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-8">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 ring-1 ring-orange-100">
        <Lock className="h-6 w-6 text-orange-600" />
      </div>
      <h1 className="text-lg font-bold text-ink-900">Protected accident report</h1>
      <p className="mt-1 text-sm text-ink-500">
        {recipient ? (
          <>
            Shared with <span className="font-semibold text-ink-700">{recipient}</span>. Enter the password the PRUMAC
            administrator gave you.
          </>
        ) : (
          "Enter the password the PRUMAC administrator gave you."
        )}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Password</span>
          <div className="relative mt-1">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoFocus
              className="h-12 w-full rounded-xl border border-ink-200 bg-white px-3.5 pr-11 font-plate text-base tracking-wide text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !password.trim()}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {isPending ? "Checking…" : "Open report"}
        </button>
      </form>

      <p className="mt-4 text-[11px] text-ink-400">
        Confidential. Please don&apos;t forward this link or the password.
      </p>
    </div>
  );
}
