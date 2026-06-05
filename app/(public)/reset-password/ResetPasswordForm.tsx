"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requestPasswordReset, updatePassword } from "@/actions/auth";

export default function ResetPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const searchParams = useSearchParams();
  const isConfirm = searchParams.has("code");

  function handleRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await requestPasswordReset(new FormData(e.currentTarget));
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setSent(true);
      }
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updatePassword(new FormData(e.currentTarget));
      if ("error" in result) {
        toast.error(result.error);
      } else if ("redirectTo" in result) {
        window.location.href = result.redirectTo;
      }
    });
  }

  if (sent) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>We sent a password reset link. It expires in 1 hour.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/login" className="text-sm text-orange-600 hover:underline">
            Back to sign in
          </a>
        </CardContent>
      </Card>
    );
  }

  if (isConfirm) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="POST" onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" required />
            </div>
            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              disabled={isPending}
            >
              {isPending ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Enter your email to receive a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="POST" onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            disabled={isPending}
          >
            {isPending ? "Sending…" : "Send reset link"}
          </Button>
          <div className="text-center">
            <a href="/login" className="text-xs text-muted-foreground hover:underline">
              Back to sign in
            </a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
