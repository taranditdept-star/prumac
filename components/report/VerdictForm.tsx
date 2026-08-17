"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Loader2, CheckCircle2 } from "lucide-react";
import { submitAccidentVerdict } from "@/actions/accident-share";
import { VERDICT_OPTIONS } from "@/lib/evidence/verdicts";

export function VerdictForm({ token, defaultRole }: { token: string; defaultRole: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [verdict, setVerdict] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await submitAccidentVerdict(token, {
        author_name: name,
        author_role: role,
        verdict,
        comment,
      });
      if ("error" in r) setError(r.error);
      else {
        setDone(true);
        setComment("");
        setVerdict("");
        router.refresh();
      }
    });
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-emerald-900">Your verdict has been recorded</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            PRUMAC management can now see it against this report.
          </p>
          <button
            type="button"
            onClick={() => setDone(false)}
            className="mt-2 text-xs font-semibold text-emerald-800 underline"
          >
            Add another comment
          </button>
        </div>
      </div>
    );
  }

  const field =
    "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Your name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Your role</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. CEO, HR, Committee"
            className={`mt-1 ${field}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Verdict *</span>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)} required className={`mt-1 ${field}`}>
          <option value="">Choose…</option>
          {VERDICT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Comments</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Your reasoning, recommended action, anything the committee should note…"
          className="mt-1 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !name.trim() || !verdict}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink-900 text-sm font-bold text-white hover:bg-ink-800 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
        {isPending ? "Recording…" : "Submit verdict"}
      </button>
    </form>
  );
}
