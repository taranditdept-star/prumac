import { History, Filter, Plus, Pencil, Trash2 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AuditEntry } from "@/types/domain";

export const dynamic = "force-dynamic";

const OP_STYLE: Record<AuditEntry["operation"], { cls: string; icon: typeof Plus; label: string }> = {
  INSERT: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Plus, label: "Created" },
  UPDATE: { cls: "bg-sky-50 text-sky-700 border-sky-200", icon: Pencil, label: "Updated" },
  DELETE: { cls: "bg-rose-50 text-rose-700 border-rose-200", icon: Trash2, label: "Deleted" },
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; op?: string }>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: entries }, { data: tables }] = await Promise.all([
    supabase
      .schema("app")
      .rpc("fn_audit_recent", {
        p_limit: 150,
        p_table: sp.table || null,
        p_operation: sp.op || null,
      })
      .returns<AuditEntry[]>(),
    supabase.schema("app").rpc("fn_audit_tables").returns<{ table_name: string; change_count: number }[]>(),
  ]);

  const list = Array.isArray(entries) ? entries : [];
  const tableOpts = Array.isArray(tables) ? tables : [];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Audit log</h1>
        <p className="text-sm text-ink-500 mt-1">Every change across the platform, with before/after detail</p>
      </div>

      {/* Filters (GET form — no client JS needed) */}
      <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white border border-ink-200/70 p-4">
        <div className="space-y-1.5">
          <label htmlFor="table" className="text-[10px] uppercase tracking-[0.12em] text-ink-400 font-bold flex items-center gap-1">
            <Filter className="h-3 w-3" /> Table
          </label>
          <select
            id="table"
            name="table"
            defaultValue={sp.table ?? ""}
            className="flex h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All tables</option>
            {tableOpts.map((t) => (
              <option key={t.table_name} value={t.table_name}>
                {t.table_name} ({t.change_count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="op" className="text-[10px] uppercase tracking-[0.12em] text-ink-400 font-bold">
            Operation
          </label>
          <select
            id="op"
            name="op"
            defaultValue={sp.op ?? ""}
            className="flex h-9 w-40 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
          </select>
        </div>
        <button type="submit" className="h-9 px-4 rounded-xl bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800">
          Apply
        </button>
        {(sp.table || sp.op) && (
          <a href="/audit" className="h-9 inline-flex items-center px-3 text-sm text-ink-500 hover:underline">
            Clear
          </a>
        )}
      </form>

      {list.length === 0 ? (
        <div className="rounded-2xl bg-white border border-ink-200/70 py-16 text-center">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-ink-100 items-center justify-center mb-3">
            <History className="h-6 w-6 text-ink-400" />
          </div>
          <p className="text-sm font-semibold text-ink-900">No matching activity</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const op = OP_STYLE[e.operation];
            const cols = e.changed_columns ?? [];
            return (
              <details key={e.id} className="group rounded-2xl bg-white border border-ink-200/70 overflow-hidden">
                <summary className="flex items-center gap-4 px-5 py-3.5 cursor-pointer list-none hover:bg-ink-50/40 transition-colors">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${op.cls}`}>
                    <op.icon className="h-3.5 w-3.5" />
                    {op.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      <span className="font-plate">{e.table_name}</span>
                      {e.operation === "UPDATE" && cols.length > 0 && (
                        <span className="text-ink-500 font-normal"> · {cols.length} field{cols.length === 1 ? "" : "s"} changed</span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {e.actor_name ?? "System"}
                      {e.actor_role ? ` · ${e.actor_role}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-ink-400 shrink-0">{ago(e.occurred_at)}</span>
                </summary>

                <div className="border-t border-ink-100 px-5 py-4 bg-ink-50/30">
                  {e.operation === "UPDATE" && cols.length > 0 ? (
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.12em] text-ink-400 font-bold">
                          <th className="text-left py-1.5 pr-4">Field</th>
                          <th className="text-left py-1.5 pr-4">Before</th>
                          <th className="text-left py-1.5">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {cols.map((col) => (
                          <tr key={col}>
                            <td className="py-1.5 pr-4 font-plate text-ink-700 font-semibold">{col}</td>
                            <td className="py-1.5 pr-4 text-rose-600 font-plate">{fmtVal(e.before_row?.[col])}</td>
                            <td className="py-1.5 text-emerald-700 font-plate">{fmtVal(e.after_row?.[col])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ) : (
                    <pre className="text-[11px] text-ink-600 whitespace-pre-wrap break-all font-plate">
                      {JSON.stringify(e.after_row ?? e.before_row ?? {}, null, 2).slice(0, 1500)}
                    </pre>
                  )}
                  <p className="text-[10px] text-ink-400 mt-3 font-plate">
                    {e.schema_name}.{e.table_name} · {e.row_pk}
                  </p>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
