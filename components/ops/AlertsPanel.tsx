"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertOctagon, AlertTriangle, Info, ShieldCheck,
  FileText, Wrench, FileX, Gauge, Satellite, Bell,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { acknowledgeAlert, resolveAlert } from "@/actions/alerts";
import { toast } from "sonner";

type AlertSeverity = "info" | "warning" | "critical";
type AlertKind =
  | "gps_offline" | "route_deviation" | "speeding"
  | "fault_reported" | "accident_reported" | "service_due"
  | "document_expiring" | "document_expired"
  | "reconciliation_flagged" | "reconciliation_critical";

export interface AlertRow {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  raised_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  vehicle_id: string | null;
}

interface AlertsPanelProps {
  initial: AlertRow[];
}

const kindIcons: Record<AlertKind, React.ComponentType<{ className?: string }>> = {
  gps_offline: Satellite,
  route_deviation: Gauge,
  speeding: Gauge,
  fault_reported: Wrench,
  accident_reported: AlertOctagon,
  service_due: Wrench,
  document_expiring: FileText,
  document_expired: FileX,
  reconciliation_flagged: Gauge,
  reconciliation_critical: AlertOctagon,
};

const severityStyles: Record<AlertSeverity, { dot: string; bg: string; text: string; border: string; icon: string }> = {
  info: {
    dot: "bg-sky-500",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
    icon: "text-sky-600",
  },
  warning: {
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: "text-amber-600",
  },
  critical: {
    dot: "bg-rose-500",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
    icon: "text-rose-600",
  },
};

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function AlertsPanel({ initial }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<AlertRow[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("alerts-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "app", table: "alerts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAlerts((prev) => [payload.new as AlertRow, ...prev].slice(0, 50));
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as AlertRow;
            setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          } else if (payload.eventType === "DELETE") {
            setAlerts((prev) => prev.filter((a) => a.id !== (payload.old as AlertRow).id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function handleAck(id: string) {
    startTransition(async () => {
      const r = await acknowledgeAlert(id);
      if ("error" in r) toast.error(r.error);
    });
  }

  function handleResolve(id: string) {
    startTransition(async () => {
      const r = await resolveAlert(id);
      if ("error" in r) toast.error(r.error);
      else toast.success("Resolved");
    });
  }

  const open = alerts.filter((a) => !a.resolved_at);
  const counts = {
    critical: open.filter((a) => a.severity === "critical").length,
    warning: open.filter((a) => a.severity === "warning").length,
    info: open.filter((a) => a.severity === "info").length,
  };

  return (
    <div className="rounded-2xl bg-white border border-ink-200/70 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-ink-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <Bell className="h-4 w-4 text-orange-600" />
            {counts.critical > 0 && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-ink-900">Live alerts</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityChip count={counts.critical} severity="critical" />
          <SeverityChip count={counts.warning} severity="warning" />
          <SeverityChip count={counts.info} severity="info" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {open.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-emerald-50 ring-4 ring-emerald-50/50 items-center justify-center mb-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-ink-900">All clear</p>
            <p className="text-xs text-ink-500 mt-1">No open alerts.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {open.map((a) => {
              const Icon = kindIcons[a.kind] ?? Info;
              const s = severityStyles[a.severity];
              return (
                <li key={a.id} className="p-4 hover:bg-ink-50/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-xl ${s.bg} flex items-center justify-center shrink-0 ring-1 ${s.border}`}>
                      <Icon className={`h-4 w-4 ${s.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-900 leading-tight">
                          {a.title}
                        </p>
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${s.text} shrink-0`}>
                          {a.severity}
                        </span>
                      </div>
                      {a.body && (
                        <p className="text-xs text-ink-500 mt-1 line-clamp-2">{a.body}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-ink-400">{timeAgo(a.raised_at)}</span>
                        <div className="flex items-center gap-3">
                          {!a.acknowledged_at && (
                            <button
                              type="button"
                              onClick={() => handleAck(a.id)}
                              disabled={isPending}
                              className="text-[11px] font-semibold text-ink-500 hover:text-ink-900 disabled:opacity-50"
                            >
                              Ack
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResolve(a.id)}
                            disabled={isPending}
                            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                      {a.acknowledged_at && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-700">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SeverityChip({ count, severity }: { count: number; severity: AlertSeverity }) {
  const s = severityStyles[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border ${s.border} ${s.bg} px-2 py-0.5 text-[11px] font-semibold ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {count} {severity}
    </span>
  );
}
