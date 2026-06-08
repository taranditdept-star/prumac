"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signInWithEmail } from "@/actions/auth";
import { signInWithEmailForm } from "@/actions/auth-form";
import { Logo } from "@/components/brand/Logo";

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
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <Logo height={52} />
        <p className="text-sm text-ink-500">Fleet management platform</p>
      </div>
      <Card className="border border-ink-200/60 shadow-2xl shadow-ink-900/5 backdrop-blur-xl bg-white/90">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>Enter your username and password</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {message === "password-updated" && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded p-2">
              Password updated — please sign in.
            </p>
          )}

          <form action={signInWithEmailForm} onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. PMD001"
                required
              />
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
            <p className="text-center text-xs text-ink-400">
              Forgot your password? Contact your fleet administrator.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
