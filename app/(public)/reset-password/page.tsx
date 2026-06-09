import { Suspense } from "react";
import Image from "next/image";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-7 flex flex-col items-center text-center">
        <Image
          src="/icons/icon-512.png"
          alt="PRUMAC Connect"
          width={512}
          height={512}
          priority
          className="h-16 w-16 rounded-2xl shadow-md ring-1 ring-ink-200/70"
        />
        <p className="mt-3 text-sm text-ink-500">Fleet management platform</p>
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-white p-2 shadow-2xl shadow-indigo-950/15 ring-1 ring-ink-200/60">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
