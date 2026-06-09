import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-7 flex flex-col items-center text-center">
        <Logo height={48} />
        <p className="mt-2.5 text-sm text-ink-500">Fleet management platform</p>
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-white p-2 shadow-2xl shadow-indigo-950/15 ring-1 ring-ink-200/60">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
