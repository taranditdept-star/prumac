import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/Logo";
import { OnboardingForm } from "@/components/driver/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id, licence_number")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string; licence_number: string }>();

  // Nothing to complete — bounce home. (licence_number is read fresh here, so
  // it reflects a just-submitted update and won't loop with the layout gate.)
  if (!driver || driver.licence_number !== "IMPORT-PENDING") redirect("/home");

  const firstName = profile.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 flex justify-center">
        <span className="rounded-2xl bg-white px-4 py-2.5 ring-1 ring-ink-100">
          <Logo height={24} />
        </span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-ink-200/70 bg-white">
        <div className="bg-gradient-to-br from-orange-500 to-rose-600 px-6 py-6 text-white">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="mt-3 text-xl font-extrabold">Welcome, {firstName}</h1>
          <p className="mt-1 text-sm text-white/85">
            Let&apos;s finish setting up your driver profile. This is a one-time step before you can start trips.
          </p>
        </div>
        <div className="p-6">
          <OnboardingForm defaultPhone={profile.phone} />
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-ink-400">
        Your details are kept private and used only for fleet operations.
      </p>
    </div>
  );
}
