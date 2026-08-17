"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Copy, Check, Ban, KeyRound, Loader2, Eye, Gavel } from "lucide-react";
import { createAccidentShare, revokeAccidentShare, resetAccidentSharePassword } from "@/actions/accident-share";
import { verdictLabel } from "@/lib/evidence/verdicts";

export interface ShareRow {
  id: string;
  token: string;
  recipient_label: string | null;
  created_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

export interface VerdictRow {
  id: string;
  author_name: string;
  author_role: string | null;
  verdict: string;
  comment: string | null;
  created_at: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Harare",
  });
}

export function AccidentSharePanel({
  accidentId,
  shares,
  verdicts,
  baseUrl,
}: {
  accidentId: string;
  shares: ShareRow[];
  verdicts: VerdictRow[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [recipient, setRecipient] = useState("");
  const [fresh, setFresh] = useState<{ url: string; password: string; recipient: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        toast.success(`${what} copied`);
        setTimeout(() => setCopied(null), 1500);
      },
      () => toast.error("Copy failed"),
    );
  }

  function create() {
    if (recipient.trim().length < 2) {
      toast.error("Say who this link is for (e.g. CEO, HR, Committee).");
      return;
    }
    startTransition(async () => {
      const r = await createAccidentShare(accidentId, recipient.trim());
      if ("error" in r) toast.error(r.error);
      else {
        setFresh(r.data!);
        setRecipient("");
        router.refresh();
      }
    });
  }

  function revoke(s: ShareRow) {
    if (!confirm(`Revoke the link for ${s.recipient_label ?? "this recipient"}? It stops working immediately.`)) return;
    startTransition(async () => {
      const r = await revokeAccidentShare(s.id);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Link revoked");
        router.refresh();
      }
    });
  }

  function resetPw(s: ShareRow) {
    if (!confirm(`Issue a new password for ${s.recipient_label ?? "this link"}? The old one stops working.`)) return;
    startTransition(async () => {
      const r = await resetAccidentSharePassword(s.id);
      if ("error" in r) toast.error(r.error);
      else {
        setFresh({ url: `${baseUrl}/report/${s.token}`, password: r.data!.password, recipient: s.recipient_label ?? "" });
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6 space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <Link2 className="h-4 w-4 text-orange-600" /> Share this report
        </h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Create a password-protected link for the CEO, HR or the committee. They don&apos;t need an account — you give
          them the link and the password separately.
        </p>
      </div>

      {/* Freshly generated credentials — shown once */}
      {fresh && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-900">
            Link ready{fresh.recipient ? ` for ${fresh.recipient}` : ""} — copy the password now
          </p>
          <p className="mt-0.5 text-xs text-emerald-700">
            The password is shown only once and can&apos;t be retrieved later. Send it separately from the link (e.g.
            password by phone, link by email).
          </p>
          <div className="mt-3 space-y-2">
            <CopyRow label="Link" value={fresh.url} copied={copied === "Link"} onCopy={() => copy(fresh.url, "Link")} />
            <CopyRow label="Password" value={fresh.password} mono copied={copied === "Password"} onCopy={() => copy(fresh.password, "Password")} />
          </div>
          <button type="button" onClick={() => setFresh(null)} className="mt-3 text-xs font-semibold text-emerald-800 underline">
            Done
          </button>
        </div>
      )}

      {/* Create */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Who is this link for?</span>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. CEO · HR · Committee — R. Chikore"
            className="mt-1 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
        </label>
        <button
          type="button"
          onClick={create}
          disabled={isPending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Create link
        </button>
      </div>

      {/* Existing links */}
      {shares.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-ink-200/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-[11px] uppercase tracking-wider text-ink-400">
                <th className="px-3 py-2 font-bold">Recipient</th>
                <th className="px-3 py-2 font-bold">Created</th>
                <th className="px-3 py-2 font-bold">Views</th>
                <th className="px-3 py-2 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shares.map((s) => {
                const revoked = !!s.revoked_at;
                return (
                  <tr key={s.id} className={revoked ? "bg-ink-50/40" : ""}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-ink-900">{s.recipient_label ?? "—"}</p>
                      {revoked ? (
                        <span className="text-[11px] font-semibold text-rose-600">Revoked {fmt(s.revoked_at)}</span>
                      ) : (
                        <span className="text-[11px] text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-500">{fmt(s.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-ink-600">
                        <Eye className="h-3.5 w-3.5" /> {s.view_count}
                        {s.last_viewed_at && <span className="text-ink-400">· {fmt(s.last_viewed_at)}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!revoked && (
                          <>
                            <button
                              type="button"
                              onClick={() => copy(`${baseUrl}/report/${s.token}`, "Link")}
                              className="rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                            >
                              Copy link
                            </button>
                            <button
                              type="button"
                              onClick={() => resetPw(s)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                            >
                              <KeyRound className="h-3.5 w-3.5" /> New password
                            </button>
                            <button
                              type="button"
                              onClick={() => revoke(s)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <Ban className="h-3.5 w-3.5" /> Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Verdicts received */}
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <Gavel className="h-4 w-4 text-ink-400" /> Verdicts received ({verdicts.length})
        </h3>
        {verdicts.length === 0 ? (
          <p className="mt-2 text-xs text-ink-500">
            No verdicts yet. They appear here as recipients review the report.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {verdicts.map((v) => (
              <li key={v.id} className="rounded-xl border border-ink-200/70 bg-ink-50/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink-900">{v.author_name}</span>
                  {v.author_role && <span className="text-xs text-ink-500">· {v.author_role}</span>}
                  <span className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-ink-700 ring-1 ring-ink-200">
                    {verdictLabel(v.verdict)}
                  </span>
                  <span className="text-[11px] text-ink-400">{fmt(v.created_at)}</span>
                </div>
                {v.comment && <p className="mt-1.5 whitespace-pre-line text-sm text-ink-700">{v.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CopyRow({
  label, value, mono, copied, onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{label}</p>
        <code className={`block truncate text-sm text-ink-900 ${mono ? "font-plate font-bold tracking-wide" : ""}`}>
          {value}
        </code>
      </div>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
