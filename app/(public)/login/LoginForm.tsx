"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signInWithEmail, requestPhoneOtp, verifyPhoneOtp } from "@/actions/auth";
import { signInWithEmailForm } from "@/actions/auth-form";
import { Logo } from "@/components/brand/Logo";

type LoginMode = "email" | "phone-request" | "phone-verify";

export default function LoginForm() {
  const [mode, setMode] = useState<LoginMode>("email");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const urlError = searchParams.get("error");

  // Surface server-side error from ?error= query string (only fires when JS-less form submit hit a problem)
  if (typeof window !== "undefined" && urlError && !isPending) {
    queueMicrotask(() => {
      toast.error(urlError);
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    });
  }

  function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    startTransition(async () => {
      try {
        const result = await signInWithEmail(new FormData(form));
        // If the action did NOT redirect, it returned an error result
        if (result && "error" in result) toast.error(result.error);
        else if (result && "redirectTo" in result) {
          window.location.href = result.redirectTo;
        }
      } catch (err) {
        // NEXT_REDIRECT throws here in newer Next.js; ignore — navigation happens automatically
        if (!(err instanceof Error) || !err.message?.includes("NEXT_REDIRECT")) {
          toast.error("Sign-in failed. Please try again.");
          console.error(err);
        }
      }
    });
  }

  function handlePhoneRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPhone(fd.get("phone") as string);
    startTransition(async () => {
      const result = await requestPhoneOtp(fd);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setMode("phone-verify");
        toast.success("Code sent. Check your SMS.");
      }
    });
  }

  function handlePhoneVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("phone", phone);
    startTransition(async () => {
      const result = await verifyPhoneOtp(fd);
      if ("error" in result) {
        toast.error(result.error);
      } else if ("redirectTo" in result) {
        window.location.href = result.redirectTo;
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <Logo height={52} />
        <p className="text-sm text-ink-500">Fleet management platform</p>
      </div>
      <Card className="border border-ink-200/60 shadow-2xl shadow-ink-900/5 backdrop-blur-xl bg-white/90">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">
          {mode === "email" && "Sign in"}
          {mode === "phone-request" && "Driver sign in"}
          {mode === "phone-verify" && "Enter your code"}
        </CardTitle>
        <CardDescription>
          {mode === "email" && "Use your email and password"}
          {mode === "phone-request" && "Enter your phone number to receive a one-time code"}
          {mode === "phone-verify" && `We sent a 6-digit code to ${phone}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {message === "password-updated" && (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">
            Password updated — please sign in.
          </p>
        )}

        {mode === "email" && (
          <form
            action={signInWithEmailForm}
            onSubmit={handleEmailLogin}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 text-white"
              disabled={isPending}
            >
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-center">
              <a href="/reset-password" className="text-xs text-muted-foreground hover:underline">
                Forgot password?
              </a>
            </div>
          </form>
        )}

        {mode === "phone-request" && (
          <form method="POST" onSubmit={handlePhoneRequest} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+263 77 123 4567"
                autoComplete="tel"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 text-white"
              disabled={isPending}
            >
              {isPending ? "Sending code…" : "Send code"}
            </Button>
          </form>
        )}

        {mode === "phone-verify" && (
          <form method="POST" onSubmit={handlePhoneVerify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="token">6-digit code</Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 shadow-lg shadow-orange-500/30 text-white"
              disabled={isPending}
            >
              {isPending ? "Verifying…" : "Verify"}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:underline"
              onClick={() => setMode("phone-request")}
            >
              Resend code
            </button>
          </form>
        )}

        <div className="relative flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-ink-200" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">or</span>
          <div className="flex-1 h-px bg-ink-200" />
        </div>

        {mode !== "email" && (
          <button
            type="button"
            onClick={() => setMode("email")}
            className="w-full h-12 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-semibold hover:bg-ink-50 active:bg-ink-100 transition-colors touch-manipulation cursor-pointer"
          >
            Sign in with email
          </button>
        )}
        {mode === "email" && (
          <button
            type="button"
            onClick={() => setMode("phone-request")}
            className="w-full h-12 rounded-xl border border-ink-200 bg-white text-ink-900 text-sm font-semibold hover:bg-ink-50 active:bg-ink-100 transition-colors touch-manipulation cursor-pointer"
          >
            Driver? Sign in with phone
          </button>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
