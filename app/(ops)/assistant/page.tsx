import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { ChitsanoChat } from "@/components/ops/ChitsanoChat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireRole("fleet_manager", "admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8 space-y-5">
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 ring-1 ring-white/15">
            <Sparkles className="h-6 w-6 text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-white">Chitsano AI</h1>
            <p className="text-sm text-slate-300">Your built-in fleet assistant — answers from live data, and can act with your say-so.</p>
          </div>
        </div>
      </div>

      <ChitsanoChat />
    </div>
  );
}
