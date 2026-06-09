"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { signInWithEmail } from "@/actions/auth";
import { signInWithEmailForm } from "@/actions/auth-form";

const inputClass =
  "h-14 w-full rounded-2xl border border-ink-200 bg-ink-50/40 px-4 text-base text-ink-900 placeholder:text-ink-400 transition-all focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/15";

export default function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [showPw, setShowPw] = useState(false);
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
    <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-indigo-950/15 ring-1 ring-ink-200/60 lg:grid lg:max-w-5xl lg:grid-cols-2">
      {/* ───────── Left: brand hero (desktop) ───────── */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#161a45] via-indigo-700 to-violet-600 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-orange-500/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.15]" />

        <span className="relative text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">
          PRUMAC Connect
        </span>

        {/* Crisp brand tile (512px source — sharp at this size) */}
        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-white/10 blur-2xl" />
            <Image
              src="/icons/icon-512.png"
              alt="PRUMAC Connect"
              width={512}
              height={512}
              priority
              className="relative h-52 w-52 rounded-[2.25rem] shadow-2xl shadow-black/40 ring-1 ring-white/40"
            />
          </div>
        </div>

        <div className="relative">
          <h2 className="text-[28px] font-extrabold leading-tight text-white">
            Run your fleet with confidence.
          </h2>
          <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-white/70">
            Live tracking, trips, maintenance, billing and safety — unified for the entire Ensign fleet.
          </p>
          <p className="mt-7 text-[11px] text-white/45">© 2026 Ensign Holdings · PRUMAC Fleet</p>
        </div>
      </div>

      {/* ───────── Right: sign-in form ───────── */}
      <div className="p-8 sm:p-10 lg:p-12">
        {/* Mobile brand tile (left panel hidden on small screens) */}
        <div className="mb-8 flex justify-center lg:hidden">
          <Image
            src="/icons/icon-512.png"
            alt="PRUMAC Connect"
            width={512}
            height={512}
            priority
            className="h-20 w-20 rounded-2xl shadow-md ring-1 ring-ink-200/70"
          />
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Welcome back</h1>
        <p className="mt-2 text-[15px] text-ink-500">Sign in to access the PRUMAC Fleet Platform.</p>

        {message === "password-updated" && (
          <p className="mt-5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Password updated — please sign in.
          </p>
        )}

        <form action={signInWithEmailForm} onSubmit={handleLogin} className="mt-8 space-y-5">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-ink-800">
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
              placeholder="Driver ID (e.g. PMD001) or staff email"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink-800">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition-colors hover:text-ink-700"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold text-white shadow-lg shadow-orange-500/30 transition-all hover:bg-orange-600 active:scale-[0.99] disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-[13px] text-ink-400">
          Forgot your password? Contact your fleet administrator.
        </p>
      </div>
    </div>
  );
}
