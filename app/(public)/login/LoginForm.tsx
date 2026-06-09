"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { signInWithEmail } from "@/actions/auth";
import { signInWithEmailForm } from "@/actions/auth-form";

const inputClass =
  "h-14 w-full rounded-xl border border-ink-200 bg-white px-4 text-base text-ink-900 placeholder:text-ink-400 transition-all focus:border-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

export default function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const urlError = searchParams.get("error");

  // Surface a server-side error passed via ?error= (no-JS form fallback).
  if (typeof window !== "undefined" && urlError && !isPending) {
    queueMicrotask(() => {
      toast.error(urlError);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    });
  }

  function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    startTransition(async () => {
      try {
        const result = await signInWithEmail(new FormData(form));
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) window.location.href = result.redirectTo;
      } catch (err) {
        if (!(err instanceof Error) || !err.message?.includes("NEXT_REDIRECT")) {
          toast.error("Sign-in failed. Please try again.");
        }
      }
    });
  }

  return (
    <div className="rounded-3xl border border-ink-200/70 bg-white/95 p-8 shadow-2xl shadow-ink-900/10 backdrop-blur-xl sm:p-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Sign in</h1>
      <p className="mt-1.5 text-[15px] text-ink-500">Welcome back — enter your details to continue.</p>

      {message === "password-updated" && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Password updated — please sign in.
        </p>
      )}

      <form action={signInWithEmailForm} onSubmit={handleLogin} className="mt-7 space-y-5">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-ink-700">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. PMD001"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-14 w-full items-center justify-center rounded-xl bg-orange-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:opacity-50"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-400">
        Forgot your password? Contact your fleet administrator.
      </p>
    </div>
  );
}
