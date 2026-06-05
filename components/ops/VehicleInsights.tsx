"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { TrendingUp, Gauge, Wrench, Fuel } from "lucide-react";

interface TripPoint {
  month: string;
  km: number;
  trips: number;
}

interface VehicleInsightsProps {
  monthly: TripPoint[];
  totalTrips: number;
  totalKm: number;
  avgTripKm: number;
  serviceProgress: { current: number; interval: number; nextDueKm: number };
  fuelType: string;
  tankLitres: number | null;
}

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
  fontSize: "12px",
  padding: "8px 12px",
};

export function VehicleInsights({
  monthly,
  totalTrips,
  totalKm,
  avgTripKm,
  serviceProgress,
  fuelType,
  tankLitres,
}: VehicleInsightsProps) {
  const sincePct = Math.min(
    100,
    Math.round((serviceProgress.current / Math.max(1, serviceProgress.interval)) * 100),
  );
  const overdue = sincePct >= 100;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightKPI
          icon={TrendingUp}
          tone="brand"
          label="Total trips"
          value={totalTrips.toString()}
          hint="lifetime"
        />
        <InsightKPI
          icon={Gauge}
          tone="sky"
          label="Total km"
          value={totalKm.toLocaleString()}
          hint="lifetime"
        />
        <InsightKPI
          icon={Gauge}
          tone="violet"
          label="Avg trip"
          value={`${avgTripKm.toLocaleString()} km`}
          hint="distance per run"
        />
        <InsightKPI
          icon={Fuel}
          tone="amber"
          label="Fuel"
          value={fuelType[0].toUpperCase() + fuelType.slice(1)}
          hint={tankLitres ? `${tankLitres} L tank` : "tank n/a"}
        />
      </div>

      {/* Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Mileage by month — area chart */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink-900">Distance trend</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Kilometres per month, last 6 months
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
                  <linearGradient id="vAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#vAreaGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trips per month — bar chart */}
        <div className="rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="mb-4">
            <h3 className="text-base font-bold text-ink-900">Trips per month</h3>
            <p className="text-xs text-ink-500 mt-0.5">Last 6 months</p>
          </div>
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="trips" radius={[6, 6, 0, 0]}>
                  {monthly.map((_, i) => (
                    <Cell key={i} fill="#0ea5e9" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Service progress + Insight card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-ink-200/70 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink-900">Next service</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Distance since last service
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                overdue
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : sincePct >= 80
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <Wrench className="h-3 w-3" />
              {overdue
                ? "Overdue"
                : sincePct >= 80
                  ? "Due soon"
                  : "On schedule"}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-ink-900 tabular">
                {serviceProgress.current.toLocaleString()} km
              </span>
              <span className="text-sm text-ink-500">
                of {serviceProgress.interval.toLocaleString()} km
              </span>
            </div>
            <div className="h-3 rounded-full bg-ink-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  overdue
                    ? "bg-gradient-to-r from-rose-500 to-rose-400"
                    : sincePct >= 80
                      ? "bg-gradient-to-r from-amber-500 to-amber-400"
                      : "bg-gradient-to-r from-emerald-500 to-emerald-400"
                }`}
                style={{ width: `${Math.min(100, sincePct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span>0 km</span>
              <span className="font-medium">
                {overdue
                  ? `Overdue by ${(serviceProgress.current - serviceProgress.interval).toLocaleString()} km`
                  : `${(serviceProgress.interval - serviceProgress.current).toLocaleString()} km to next service`}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-700 text-white p-6 shadow-lg shadow-violet-500/20 overflow-hidden relative">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <TrendingUp className="h-6 w-6 text-violet-200 mb-4" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-violet-200 font-semibold">
            Performance
          </p>
          <p className="text-base font-semibold mt-1 leading-snug">
            {totalTrips > 0
              ? `${avgTripKm.toLocaleString()} km average trip distance.`
              : "No trips recorded yet."}
          </p>
          <p className="text-xs text-violet-200 mt-3">
            {overdue
              ? "Schedule a service to keep this vehicle reliable."
              : "Vehicle is operating within scheduled maintenance intervals."}
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
  tone: "brand" | "sky" | "violet" | "amber";
  label: string;
  value: string;
  hint?: string;
}) {
  const toneMap = {
    brand: "bg-orange-50 text-orange-600 ring-orange-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
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
