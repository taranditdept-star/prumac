"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { IdCard, Phone, CalendarDays } from "lucide-react";
import { completeOnboarding } from "@/actions/onboarding";

interface OnboardingFormProps {
  defaultPhone?: string | null;
}

export function OnboardingForm({ defaultPhone }: OnboardingFormProps) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await completeOnboarding(fd);
      if (r && "redirectTo" in r) {
        window.location.href = r.redirectTo;
      } else if (r && "error" in r) {
        toast.error(r.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Phone number" icon={Phone}>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          required
          defaultValue={defaultPhone ?? ""}
          placeholder="+263 …"
          className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-base text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </Field>

      <Field label="Driver's licence number" icon={IdCard}>
        <input
          name="licence_number"
          type="text"
          required
          autoCapitalize="characters"
          placeholder="e.g. 631234ZW"
          className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-base font-plate text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </Field>

      <Field label="Licence expiry (optional)" icon={CalendarDays}>
        <input
          name="licence_expires_at"
          type="date"
          className="w-full rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-base text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </Field>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 h-14 w-full rounded-2xl bg-orange-600 text-base font-bold text-white shadow-lg shadow-orange-600/20 transition-all hover:bg-orange-700 active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      {children}
    </div>
  );
}
