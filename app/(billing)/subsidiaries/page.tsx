import Link from "next/link";
import { Building, ArrowUpRight, MapPin, Globe } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SubBreakdown {
  subsidiary_id: string;
  name: string;
  country: string;
  trips: number;
  km: number;
  revenue: number;
  outstanding: number;
}

function money(n: number, c = "USD"): string {
  return `${c} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default async function SubsidiariesPage() {
  await requireRole("admin");
  const supabase = await createClient();

  const last90 = new Date();
  last90.setDate(last90.getDate() - 90);
  const periodStart = last90.toISOString().slice(0, 10);
  const periodEnd = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .schema("app")
    .rpc("fn_subsidiary_breakdown", { p_period_start: periodStart, p_period_end: periodEnd });

  const list: SubBreakdown[] = Array.isArray(data) ? (data as SubBreakdown[]) : [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Subsidiaries</h1>
        <p className="text-sm text-ink-500 mt-1">
          {list.length} billable Ensign Holdings subsidiaries · last 90 days activity shown
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((s) => (
          <Link
            key={s.subsidiary_id}
            href={`/subsidiaries/${s.subsidiary_id}`}
            className="group relative rounded-2xl bg-white border border-ink-200/70 p-5 hover:border-orange-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
          >
            <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-orange-500/5 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <Building className="h-6 w-6" />
                </div>
                <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-700">
                  <Globe className="h-2.5 w-2.5" />
                  {s.country}
                </span>
              </div>
              <p className="text-base font-bold text-ink-900 truncate group-hover:text-orange-600 transition-colors">
                {s.name}
              </p>
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-ink-100">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-400 font-bold">Revenue (90d)</p>
                  <p className="text-base font-bold text-ink-900 tabular font-plate mt-0.5">{money(s.revenue)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-400 font-bold">Outstanding</p>
                  <p className={`text-base font-bold tabular font-plate mt-0.5 ${Number(s.outstanding) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {money(s.outstanding)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                <span>
                  {Number(s.trips).toLocaleString()} trips · {Number(s.km).toLocaleString()} km
                </span>
                <ArrowUpRight className="h-4 w-4 text-ink-300 group-hover:text-orange-500 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
