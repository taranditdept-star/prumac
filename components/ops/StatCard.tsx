import {
  ArrowDownRight,
  ArrowUpRight,
  Truck,
  Users,
  AlertTriangle,
  Activity,
  Gauge,
  ShieldCheck,
  Receipt,
  type LucideIcon,
} from "lucide-react";

type IconName = "truck" | "users" | "alert" | "activity" | "gauge" | "shield" | "receipt";

const iconMap: Record<IconName, LucideIcon> = {
  truck: Truck,
  users: Users,
  alert: AlertTriangle,
  activity: Activity,
  gauge: Gauge,
  shield: ShieldCheck,
  receipt: Receipt,
};

type Tone = "brand" | "emerald" | "amber" | "rose" | "sky" | "violet";

const tones: Record<Tone, { iconBg: string; iconText: string; ring: string; sparkColor: string }> = {
  brand:   { iconBg: "bg-orange-50",  iconText: "text-orange-600",  ring: "ring-orange-100",  sparkColor: "#ff5a1f" },
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", ring: "ring-emerald-100", sparkColor: "#10b981" },
  amber:   { iconBg: "bg-amber-50",   iconText: "text-amber-600",   ring: "ring-amber-100",   sparkColor: "#f59e0b" },
  rose:    { iconBg: "bg-rose-50",    iconText: "text-rose-600",    ring: "ring-rose-100",    sparkColor: "#ef4444" },
  sky:     { iconBg: "bg-sky-50",     iconText: "text-sky-600",     ring: "ring-sky-100",     sparkColor: "#0ea5e9" },
  violet:  { iconBg: "bg-violet-50",  iconText: "text-violet-600",  ring: "ring-violet-100",  sparkColor: "#8b5cf6" },
};

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; positive?: boolean };
  iconName: IconName;
  tone: Tone;
  hint?: string;
  sparkline?: number[];
  index?: number;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const id = `g-${color.replace("#", "")}`;
  const lastX = w;
  const lastY = h - ((data[data.length - 1] - min) / range) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 mt-3" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,${h} ${points} ${w},${h}`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  delta,
  iconName,
  tone,
  hint,
  sparkline,
  index = 0,
}: StatCardProps) {
  const t = tones[tone];
  const Icon = iconMap[iconName];

  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className="group relative rounded-2xl bg-white border border-ink-200/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300 animate-fade-up"
    >
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl ${t.iconBg} ${t.iconText} ring-1 ${t.ring} flex items-center justify-center`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </div>
        {delta && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
              delta.positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {delta.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {delta.value}
          </span>
        )}
      </div>
      <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-ink-400 font-semibold">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink-900 tabular leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {sparkline && <Sparkline data={sparkline} color={t.sparkColor} />}
    </div>
  );
}
