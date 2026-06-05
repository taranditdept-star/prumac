"use client";

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { Route, Award, Target, Timer } from "lucide-react";

interface MonthlyPoint {
  month: string;
  km: number;
  trips: number;
}

interface DriverInsightsProps {
  monthly: MonthlyPoint[];
  totalKm: number;
  totalTrips: number;
  avgTripKm: number;
  cancellationRate: number; // 0..1
  yearsActive: number;
}

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
  fontSize: "12px",
  padding: "8px 12px",
};

export function DriverInsights({
  monthly,
  totalKm,
  totalTrips,
  avgTripKm,
  cancellationRate,
  yearsActive,
}: DriverInsightsProps) {
  const successRate = Math.round((1 - cancellationRate) * 100);
  const radialData = [{ name: "success", value: successRate, fill: "#10b981" }];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightKPI icon={Route} tone="brand" label="Lifetime km" value={totalKm.toLocaleString()} />
        <InsightKPI icon={Target} tone="sky" label="Trips" value={totalTrips.toLocaleString()} hint={`${avgTripKm.toLocaleString()} km avg`} />
        <InsightKPI icon={Award} tone="emerald" label="Success rate" value={`${successRate}%`} hint="of trips completed" />
        <InsightKPI icon={Timer} tone="violet" label="With PRUMAC" value={yearsActive > 0 ? `${yearsActive}y` : "<1y"} hint="years active" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity area chart */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink-900">Driver activity</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Distance driven per month, last 6 months
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
              <span className="text-xs text-ink-600 font-medium">km</span>
            </span>
          </div>
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="dAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff5a1f" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ff5a1f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }} contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="km"
                  stroke="#ff5a1f"
                  strokeWidth={2.5}
                  fill="url(#dAreaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reliability radial */}
        <div className="rounded-2xl bg-white border border-ink-200/70 p-6 flex flex-col">
          <div className="mb-2">
            <h3 className="text-base font-bold text-ink-900">Reliability</h3>
            <p className="text-xs text-ink-500 mt-0.5">Completion vs cancellation</p>
          </div>
          <div className="relative flex-1 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "#f1f5f9" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-3xl font-bold text-ink-900 tabular leading-none">{successRate}%</p>
              <p className="text-[10px] uppercase tracking-[0.15em] text-ink-400 mt-1.5 font-semibold">
                Success
              </p>
            </div>
          </div>
          <p className="text-xs text-center text-ink-500 mt-2">
            {totalTrips} trips · {Math.round(cancellationRate * 100)}% cancelled
          </p>
        </div>
      </div>

      {/* Insight callout */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white p-6 shadow-lg shadow-emerald-500/20 overflow-hidden relative">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <Award className="h-6 w-6 text-emerald-200 mb-3" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-200 font-semibold">
            Performance snapshot
          </p>
          <p className="text-base font-semibold mt-1 leading-snug max-w-3xl">
            {totalTrips === 0
              ? "No trips logged yet — performance metrics will populate after the first completed trip."
              : successRate >= 95
                ? `Reliable performer — ${successRate}% trip success rate over ${totalTrips} trips.`
                : successRate >= 85
                  ? `Solid performance with ${successRate}% trip success rate.`
                  : `Trip success rate is ${successRate}%. Consider reviewing route plans or vehicle assignments.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function InsightKPI({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "brand" | "sky" | "violet" | "emerald";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneMap = {
    brand: "bg-orange-50 text-orange-600 ring-orange-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  };
  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 p-5">
      <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center mb-3 ${toneMap[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink-900 tabular">{value}</p>
      {hint && <p className="text-[11px] text-ink-500 mt-0.5">{hint}</p>}
    </div>
  );
}
