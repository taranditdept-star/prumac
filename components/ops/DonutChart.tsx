interface Segment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}

export function DonutChart({ segments, centerValue, centerLabel, size = 160 }: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const length = (seg.value / total) * circumference;
    const arc = (
      <circle
        key={seg.label}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${length} ${circumference - length}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    offset += length;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {arcs}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold text-ink-900 tabular-nums">{centerValue}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
            {centerLabel}
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-2.5">
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          return (
            <div key={seg.label} className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-sm text-slate-600 flex-1">{seg.label}</span>
              <span className="text-sm font-semibold text-ink-900 tabular-nums">
                {seg.value}
              </span>
              <span className="text-xs text-slate-400 tabular-nums w-9 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
