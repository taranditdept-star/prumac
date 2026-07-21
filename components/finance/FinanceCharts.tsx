"use client";

import {
  Bar, BarChart, ComposedChart, Line, Area, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend, PieChart, Pie,
} from "recharts";

const tooltipStyle = { borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(15,23,42,0.08)", fontSize: "12px", padding: "8px 12px" };
const money = (v: unknown) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const kFmt = (v: number) => `$${(Number(v) / 1000).toFixed(0)}k`;

function EmptyChart({ msg, h = "h-72" }: { msg: string; h?: string }) {
  return (
    <div className={`w-full ${h} rounded-2xl bg-ink-50/50 border border-dashed border-ink-200 flex items-center justify-center`}>
      <p className="text-sm text-ink-500">{msg}</p>
    </div>
  );
}

// Revenue vs expense (areas) + profit line
export function ProfitTrendChart({ data }: { data: { label: string; revenue: number; expense: number; profit: number }[] }) {
  if (!data.some((d) => d.revenue || d.expense)) return <EmptyChart msg="No income or expense activity in this period" h="h-80" />;
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
          <defs>
            <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
            <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} interval={0} angle={-20} textAnchor="end" height={46} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => kFmt(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 4" }} formatter={((v: unknown, n: unknown) => [money(v), n as string]) as never} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
          <Area type="monotone" dataKey="revenue" name="Income" stroke="#10b981" strokeWidth={2.5} fill="url(#revG)" />
          <Area type="monotone" dataKey="expense" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expG)" />
          <Line type="monotone" dataKey="profit" name="Net profit" stroke="#ff5a1f" strokeWidth={2.5} dot={{ r: 3, fill: "#ff5a1f" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <EmptyChart msg="No expenses recorded" h="h-64" />;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={((v: unknown, n: unknown) => [money(v), n as string]) as never} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Total</span>
          <span className="text-xl font-bold text-ink-900 tabular">{money(total)}</span>
        </div>
      </div>
      <ul className="mt-3 w-full space-y-1.5">
        {data.slice(0, 6).map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate text-ink-600">{d.name}</span>
            <span className="font-plate font-semibold text-ink-800">{money(d.value)}</span>
            <span className="w-10 text-right text-ink-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal-ish aging: single stacked bar per… we use a simple bar of buckets
export function AgingBars({ data }: { data: { bucket: string; amount: number; color: string }[] }) {
  if (!data.some((d) => d.amount > 0)) return <EmptyChart msg="No outstanding balances" h="h-56" />;
  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#475569" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => kFmt(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={((v: unknown) => [money(v), "Outstanding"]) as never} />
          <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashflowChart({ data }: { data: { label: string; receipts: number; payments: number }[] }) {
  if (!data.some((d) => d.receipts || d.payments)) return <EmptyChart msg="No cash movements in this period" h="h-72" />;
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} dy={8} interval={0} angle={-20} textAnchor="end" height={46} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => kFmt(Number(v))} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} formatter={((v: unknown, n: unknown) => [money(v), n as string]) as never} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
          <Bar dataKey="receipts" name="Receipts" fill="#10b981" radius={[6, 6, 0, 0]} />
          <Bar dataKey="payments" name="Payments" fill="#ef4444" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
