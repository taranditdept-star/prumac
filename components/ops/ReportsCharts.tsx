"use client";

import {
  Bar, BarChart, ComposedChart, Line, Area, AreaChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend,
} from "recharts";

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
  fontSize: "12px",
  padding: "8px 12px",
};

interface RevenuePoint {
  month_label: string;
  revenue: number;
  trips: number;
  km: number;
  active_vehicles: number;
}

export function RevenueTrendChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5a1f" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ff5a1f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month_label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }}
            formatter={((value: unknown, name: unknown) => {
              if (name === "Revenue") return [`$${Number(value).toLocaleString()}`, name as string];
              return [Number(value).toLocaleString(), name as string];
            }) as never}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            iconType="circle"
            iconSize={8}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#ff5a1f"
            strokeWidth={2.5}
            fill="url(#revGrad)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="trips"
            name="Trips"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#0ea5e9" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SubsidiaryBreakdown {
  name: string;
  revenue: number;
  trips: number;
  outstanding: number;
}

export function SubsidiaryBarChart({ data }: { data: SubsidiaryBreakdown[] }) {
  const display = data
    .filter((d) => d.revenue > 0 || d.trips > 0)
    .slice(0, 10)
    .map((d) => ({ ...d, shortName: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name }));

  if (display.length === 0) {
    return (
      <div className="rounded-2xl bg-ink-50/50 border border-dashed border-ink-200 py-12 text-center">
        <p className="text-sm text-ink-500">No revenue activity in this period</p>
      </div>
    );
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={display} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="shortName"
            tick={{ fontSize: 10, fill: "#475569" }}
            tickLine={false}
            axisLine={false}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "#f1f5f9" }}
            formatter={((value: unknown) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "Revenue"]) as never}
          />
          <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
            {display.map((_, i) => (
              <Cell key={i} fill={i === 0 ? "#ff5a1f" : i === 1 ? "#0ea5e9" : i === 2 ? "#8b5cf6" : "#94a3b8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface MaintPoint {
  month_label: string;
  routine: number;
  repair: number;
  total: number;
}

export function MaintenanceTrendChart({ data }: { data: MaintPoint[] }) {
  const hasData = data.some((d) => Number(d.total) > 0);
  if (!hasData) {
    return (
      <div className="rounded-2xl bg-ink-50/50 border border-dashed border-ink-200 py-12 text-center">
        <p className="text-sm text-ink-500">No maintenance spend recorded in this window</p>
      </div>
    );
  }
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month_label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} interval={0} angle={-20} textAnchor="end" height={48} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(1)}k`} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "#f1f5f9" }}
            formatter={((value: unknown, name: unknown) => [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name as string]) as never}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
          <Bar dataKey="routine" name="Routine service" stackId="a" fill="#10b981" />
          <Bar dataKey="repair" name="Repairs" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface UtilPoint {
  month_label: string;
  active_vehicles: number;
}

export function FleetUtilisationChart({ data, totalFleet }: { data: UtilPoint[]; totalFleet: number }) {
  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month_label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            domain={[0, totalFleet]}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }}
            formatter={((value: unknown) => [`${value} / ${totalFleet} vehicles`, "Active"]) as never}
          />
          <Area
            type="monotone"
            dataKey="active_vehicles"
            name="Active vehicles"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#utilGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
