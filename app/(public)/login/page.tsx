import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, roleDefaultPath } from "@/lib/auth/session";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // If already authenticated, send the user to their default landing page.
  const profile = await getSession();
  if (profile) redirect(roleDefaultPath(profile.role));

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
