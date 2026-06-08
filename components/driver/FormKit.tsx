"use client";

import type { ReactNode } from "react";

/** A titled card section for grouping related fields on mobile forms. */
export function FormSection({
  step, title, hint, children,
}: {
  step?: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white border border-ink-200/70 shadow-sm p-4 space-y-3.5">
      <div className="flex items-start gap-2.5">
        {step != null && (
          <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-ink-900 text-white text-xs font-bold flex items-center justify-center">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink-900">{title}</h2>
          {hint && <p className="text-[11px] text-ink-500 mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Field label used above an input. */
export function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500 mb-1.5">
      {children}
      {required && <span className="text-orange-500"> *</span>}
    </label>
  );
}

/** Shared control classes — large, touch-friendly, consistent. */
export const fieldClass =
  "h-[52px] w-full rounded-2xl border border-ink-200 bg-white px-4 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 transition-all";
export const selectClass = `${fieldClass} appearance-none cursor-pointer pr-10`;
export const textareaClass =
  "w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 resize-none transition-all";

/** Primary full-width submit button (sits at the end of the scrollable form). */
export function SubmitButton({
  children, disabled, tone = "orange", icon,
}: {
  children: ReactNode;
  disabled?: boolean;
  tone?: "orange" | "rose";
  icon?: ReactNode;
}) {
  const bg = tone === "rose" ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/30" : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/30";
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`w-full h-14 rounded-2xl ${bg} text-white font-bold text-base inline-flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 active:scale-[0.99]`}
    >
      {icon}
      {children}
    </button>
  );
}
