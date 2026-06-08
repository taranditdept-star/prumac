import Link from "next/link";
import {
  ArrowLeft, ArrowLeftRight, ChevronRight, ArrowDownLeft, ArrowUpRight, Plus,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlateBadge } from "@/components/primitives/PlateBadge";
import type { CountryCode } from "@/types/domain";

export const dynamic = "force-dynamic";

interface HandoverRow {
  id: string;
  plate_number: string;
  plate_country: CountryCode;
  make: string;
  model: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  direction: "incoming" | "outgoing";
  other_party_name: string | null;
  created_at: string;
}

const STATUS = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  accepted: { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  cancelled: { label: "Cancelled", cls: "bg-ink-100 text-ink-600 border-ink-200" },
};

export default async function HandoverListPage() {
  await requireAuth();
  const supabase = await createClient();
  const { data } = await supabase.schema("app").rpc("fn_my_handovers");
  const rows = (Array.isArray(data) ? data : []) as HandoverRow[];

  const incomingPending = rows.filter((r) => r.direction === "incoming" && r.status === "pending");
  const others = rows.filter((r) => !(r.direction === "incoming" && r.status === "pending"));

  return (
    <div className="p-4 pt-6 space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold">Vehicle</p>
          <h1 className="text-2xl font-bold text-ink-900 mt-1">Handovers</h1>
        </div>
        <Link
          href="/handover/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-orange-500 text-white text-sm font-bold shrink-0"
        >
          <Plus className="h-4 w-4" /> New
        </Link>
      </header>

      {incomingPending.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-orange-600 font-bold px-1">
            Waiting for you to confirm
          </p>
          {incomingPending.map((r) => <HandoverCard key={r.id} r={r} />)}
        </section>
      )}

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 font-bold px-1">History</p>
        {others.length === 0 ? (
          <div className="rounded-3xl bg-white border border-ink-200/70 py-10 text-center">
            <div className="inline-flex h-12 w-12 rounded-2xl bg-ink-100 items-center justify-center mb-2">
              <ArrowLeftRight className="h-5 w-5 text-ink-400" />
            </div>
            <p className="text-sm text-ink-700 font-semibold">No handovers yet</p>
            <p className="text-[11px] text-ink-500 mt-0.5">Start one when passing a vehicle to another driver.</p>
          </div>
        ) : (
          others.map((r) => <HandoverCard key={r.id} r={r} />)
        )}
      </section>
    </div>
  );
}

function HandoverCard({ r }: { r: HandoverRow }) {
  const s = STATUS[r.status];
  const Dir = r.direction === "incoming" ? ArrowDownLeft : ArrowUpRight;
  return (
    <Link
      href={`/handover/${r.id}`}
      className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-ink-200/70 hover:border-orange-200 active:scale-[0.99] transition-all"
    >
      <div className="h-10 w-10 rounded-xl bg-ink-50 ring-1 ring-ink-100 flex items-center justify-center shrink-0">
        <Dir className="h-4 w-4 text-ink-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <PlateBadge plate={r.plate_number} country={r.plate_country} size="sm" />
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${s.cls}`}>
            {s.label}
          </span>
        </div>
        <p className="text-xs text-ink-500 mt-1 truncate">
          {r.direction === "incoming" ? "From" : "To"} {r.other_party_name ?? "driver"} · {r.make} {r.model}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-300" />
    </Link>
  );
}
