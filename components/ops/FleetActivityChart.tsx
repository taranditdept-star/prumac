"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  day: string;
  trips: number;
  km: number;
}

interface FleetActivityChartProps {
  data: Point[];
}

export function FleetActivityChart({ data }: FleetActivityChartProps) {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="tripsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5a1f" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#ff5a1f" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="kmGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            dy={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
              fontSize: "12px",
              padding: "8px 12px",
            }}
            labelStyle={{ color: "#475569", fontWeight: 600, marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="trips"
            stroke="#ff5a1f"
            strokeWidth={2.5}
            fill="url(#tripsGradient)"
            name="Trips"
          />
          <Area
            type="monotone"
            dataKey="km"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            fill="url(#kmGradient)"
            name="Kilometres"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
