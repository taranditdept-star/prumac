"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface StatusDonutProps {
  segments: Segment[];
  centerValue: string | number;
  centerLabel: string;
}

export function StatusDonut({ segments, centerValue, centerLabel }: StatusDonutProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const data = segments.map((s) => ({ name: s.label, value: s.value, color: s.color }));

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative w-44 h-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={86}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                fontSize: "12px",
                padding: "6px 10px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-3xl font-bold text-ink-900 tabular leading-none">{centerValue}</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-400 mt-1.5 font-semibold">
            {centerLabel}
          </p>
        </div>
      </div>
      <div className="flex-1 min-w-48 space-y-3">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          return (
            <div key={seg.label} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm text-ink-700 flex-1">{seg.label}</span>
              <span className="text-sm font-bold text-ink-900 tabular">{seg.value}</span>
              <span className="text-xs text-ink-400 tabular w-10 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
