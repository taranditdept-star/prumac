import { Settings as SettingsIcon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSettingsFresh } from "@/lib/settings";
import { ThresholdsForm, TermsForm } from "@/components/ops/SettingsForms";
import { EmailDigestCard } from "@/components/ops/EmailDigestCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const [settings, { data: terms }] = await Promise.all([
    getSettingsFresh(),
    supabase
      .schema("app")
      .from("agreements")
      .select("title, body_md, version")
      .eq("kind", "trip_terms")
      .eq("is_active", true)
      .maybeSingle<{ title: string; body_md: string; version: number }>(),
  ]);

  const odometerThreshold = Number(settings.odometer_jump_threshold_km) || 1500;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Hero */}
      <div className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-7 py-7">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <SettingsIcon className="h-6 w-6 text-orange-400" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Settings</h1>
            <p className="text-sm text-slate-300">Configuration that applies across the platform.</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <ThresholdsForm odometerThreshold={odometerThreshold} />
        <EmailDigestCard />
        <TermsForm
          title={terms?.title ?? "PRUMAC Vehicle-Use Agreement & Privacy Notice"}
          body={terms?.body_md ?? ""}
          version={terms?.version ?? null}
        />
      </div>
    </div>
  );
}
