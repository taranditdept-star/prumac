import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Phone-sized stand-in for a table row.
 *
 * The ops screens are built around wide tables (min-w-[900px]) inside a
 * horizontal scroller. On a desktop that is fine; on a phone it means the
 * manager sees two columns and has to drag sideways to read a title or reach
 * the action — which is exactly the complaint. Each list page therefore renders
 * `<CardList>` of these below `md`, and keeps its table for `md` and up.
 *
 * Deliberately not a client component: the ops pages are server components and
 * pass their own interactive bits (RowMenu) in through `action`.
 */

export function CardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-ink-100 md:hidden">{children}</ul>;
}

export interface RecordCardProps {
  /** Makes the whole card tappable. Omit when `action` is the only affordance. */
  href?: string;
  /** Plate badge, avatar, icon — anything that identifies the row at a glance. */
  lead?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Status / severity pills. */
  badges?: ReactNode;
  /** Secondary fields, shown as a two-column label/value grid. */
  meta?: { label: string; value: ReactNode }[];
  /** RowMenu or similar. Rendered outside the link so it stays clickable. */
  action?: ReactNode;
}

export function RecordCard({ href, lead, title, subtitle, badges, meta, action }: RecordCardProps) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        {lead && <div className="shrink-0">{lead}</div>}
        <div className="min-w-0 flex-1">
          {/* Titles wrap here rather than truncate — on a phone the title is
              the whole point of the row, and there is no column to spare. */}
          <p className="text-[15px] font-semibold leading-snug text-ink-900">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
        {href && !action && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />}
      </div>

      {badges && <div className="mt-2.5 flex flex-wrap items-center gap-2">{badges}</div>}

      {meta && meta.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
                {m.label}
              </dt>
              <dd className="mt-0.5 truncate text-[13px] text-ink-700">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  return (
    <li className="relative">
      {href ? (
        <Link href={href} className="block px-4 py-4 active:bg-ink-50/60">
          {body}
        </Link>
      ) : (
        <div className="px-4 py-4">{body}</div>
      )}
      {action && (
        <div className="absolute right-2 top-3">{action}</div>
      )}
    </li>
  );
}
