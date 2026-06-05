import { ShieldCheck, Clock, CheckCircle2, AlertOctagon, FileWarning, ClipboardX } from "lucide-react";
import { RatingBadge } from "@/components/primitives/RatingBadge";
import type { DriverScorecard as Scorecard } from "@/types/domain";

function ringColor(score: number): string {
  if (score >= 85) return "#10b981"; // emerald
  if (score >= 70) return "#0ea5e9"; // sky
  if (score >= 50) return "#f59e0b"; // amber
  return "#f43f5e"; // rose
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  const color = ringColor(score);
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#eef1f6" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-ink-900 font-plate tabular">{Math.round(score)}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">/ 100</span>
      </div>
    </div>
  );
}

export function DriverScorecard({ score, compact = false }: { score: Scorecard; compact?: boolean }) {
  const metrics = [
    { icon: ShieldCheck, label: "Safety score", value: `${Math.round(Number(score.safety_score))}`, tone: "text-emerald-600" },
    { icon: Clock, label: "Punctuality", value: `${Number(score.punctuality_pct).toFixed(0)}%`, tone: "text-sky-600" },
    { icon: CheckCircle2, label: "Completion", value: `${Number(score.completion_rate).toFixed(0)}%`, tone: "text-violet-600" },
    { icon: AlertOctagon, label: "Accidents", value: `${score.accident_count}`, tone: "text-rose-600" },
    { icon: FileWarning, label: "Recon flags", value: `${score.recon_flag_count + score.recon_critical_count}`, tone: "text-amber-600" },
    { icon: ClipboardX, label: "Failed checks", value: `${score.inspection_fail_count}`, tone: "text-orange-600" },
  ];

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5 lg:p-6">
      <div className="flex items-center gap-6 flex-wrap">
        <ScoreRing score={Number(score.overall_score)} />
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-bold text-ink-900">Driver score</p>
            <RatingBadge rating={score.rating} />
          </div>
          <p className="text-sm text-ink-500">
            {score.trips_completed} completed trip{score.trips_completed === 1 ? "" : "s"} ·{" "}
            {Math.round(Number(score.total_km)).toLocaleString()} km driven
          </p>
          <p className="text-xs text-ink-400 mt-1">
            Weighted from safety (60%), punctuality (20%) and completion (20%).
          </p>
        </div>
      </div>

      {!compact && (
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-ink-50/60 border border-ink-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <m.icon className={`h-3.5 w-3.5 ${m.tone}`} />
                <p className="text-[10px] uppercase tracking-[0.12em] text-ink-400 font-bold">{m.label}</p>
              </div>
              <p className="text-lg font-bold text-ink-900 font-plate tabular mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
