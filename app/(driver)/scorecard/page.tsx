import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DriverScorecard } from "@/components/ops/DriverScorecard";
import type { DriverScorecard as Scorecard } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function DriverScorecardPage() {
  const profile = await requireAuth();
  const supabase = await createClient();

  const { data: driver } = await supabase
    .schema("app")
    .from("drivers")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();

  let score: Scorecard | null = null;
  if (driver) {
    const { data } = await supabase
      .schema("app")
      .rpc("fn_driver_scorecard", { p_driver_id: driver.id })
      .maybeSingle<Scorecard>();
    score = data;
  }

  return (
    <div className="px-4 py-5 space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500">
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink-900">My scorecard</h1>
        <p className="text-sm text-ink-500 mt-0.5">Your safety &amp; performance rating</p>
      </div>

      {score ? (
        <DriverScorecard score={score} />
      ) : (
        <div className="rounded-3xl bg-white border border-ink-200/70 py-10 text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
            <ShieldCheck className="h-5 w-5 text-ink-400" />
          </div>
          <p className="text-sm text-ink-700 font-semibold">No score yet</p>
          <p className="text-[11px] text-ink-500 mt-0.5">Complete trips to build your rating.</p>
        </div>
      )}

      <p className="text-[11px] text-ink-400 text-center px-4">
        Your score rewards safe driving, on-time starts and completed trips. Accidents, reconciliation flags and
        failed inspections lower it.
      </p>
    </div>
  );
}
