"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, FileSearch, Loader2, AlertTriangle, ScanText } from "lucide-react";
import { extractMediaText, runChitsanoAccidentReview } from "@/actions/accident-analysis";
import { verdictLabel } from "@/lib/evidence/verdicts";

export interface DocItem {
  id: string;
  original_filename: string | null;
  source: string;
  source_detail: string | null;
  extracted_text: string | null;
  extracted_at: string | null;
}

export interface ChitsanoVerdict {
  verdict: string;
  comment: string | null;
  created_at: string;
}

/** Renders the **bold** markers Chitsano's summary uses, nothing else. */
function renderLine(line: string, key: number) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p key={key} className={line.startsWith("•") ? "pl-3 text-sm text-ink-700" : "text-sm text-ink-700"}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold text-ink-900">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export function AccidentAnalysisPanel({
  accidentId,
  driverStatement,
  documents,
  chitsano,
}: {
  accidentId: string;
  driverStatement: string;
  documents: DocItem[];
  chitsano: ChitsanoVerdict | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const committeeDocs = documents.filter((d) => d.extracted_text);
  const pending = documents.filter((d) => !d.extracted_text);

  function extract(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const r = await extractMediaText(id);
      setBusyId(null);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(`Read ${r.data?.chars.toLocaleString()} characters`);
        router.refresh();
      }
    });
  }

  function review() {
    startTransition(async () => {
      const r = await runChitsanoAccidentReview(accidentId);
      if ("error" in r) toast.error(r.error);
      else {
        const n = r.data?.discrepancies ?? 0;
        if (n > 0) toast.warning(`Chitsano flagged ${n} discrepanc${n === 1 ? "y" : "ies"}`);
        else toast.success("Chitsano found no discrepancies");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6 space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <FileSearch className="h-4 w-4 text-orange-600" /> Statements &amp; review
        </h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Read the committee&apos;s report, compare it with the driver&apos;s account, and record Chitsano&apos;s
          assessment alongside the human verdicts.
        </p>
      </div>

      {/* Documents awaiting extraction */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-ink-200/70 bg-ink-50/40 p-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">Read text from a document</p>
          <div className="space-y-1.5">
            {pending.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <ScanText className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-700">{d.original_filename ?? "Document"}</span>
                <button
                  type="button"
                  onClick={() => extract(d.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] font-semibold text-ink-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50"
                >
                  {busyId === d.id ? "Reading…" : "Extract text"}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-400">Word (.docx) and text files only — a PDF can&apos;t be read yet.</p>
        </div>
      )}

      {/* The two accounts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Driver&apos;s account</p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-800">
            {driverStatement || "—"}
          </p>
        </article>

        <article className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">
            PRUMAC Committee report
          </p>
          {committeeDocs.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-500">
              No committee text yet — attach their report as a .docx and press <em>Extract text</em>.
            </p>
          ) : (
            committeeDocs.map((d) => (
              <div key={d.id} className="mt-1.5">
                <p className="text-[11px] font-semibold text-ink-500">
                  {d.source_detail || d.original_filename}
                </p>
                <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-800">
                  {d.extracted_text}
                </p>
              </div>
            ))
          )}
        </article>
      </div>

      {/* Chitsano */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-violet-900">
            <Sparkles className="h-4 w-4" /> Chitsano&apos;s review
          </p>
          <button
            type="button"
            onClick={review}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {chitsano ? "Re-run review" : "Run review"}
          </button>
        </div>

        {chitsano ? (
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-200">
              {verdictLabel(chitsano.verdict)}
            </span>
            <div className="mt-2 space-y-1">
              {(chitsano.comment ?? "").split("\n").map((l, i) => (l.trim() ? renderLine(l, i) : <div key={i} className="h-1.5" />))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-600">
            Not run yet. Chitsano will compare the two accounts and flag anything that doesn&apos;t line up.
          </p>
        )}

        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/70 p-2 text-[11px] text-ink-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Chitsano compares wording and facts — it does not watch the videos, listen to the recordings or judge the
          photos. Treat it as a checklist for the committee, not a decision.
        </p>
      </div>
    </section>
  );
}
