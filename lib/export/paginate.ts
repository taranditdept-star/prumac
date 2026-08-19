import { EXPORT_LIMIT } from "./types";

/** PostgREST caps a single response at 1000 rows regardless of .limit(). */
const PAGE = 1000;

/**
 * Reads every row a dataset matches, a page at a time.
 *
 * Without this an export of a busy table stops at 1000 rows and looks complete
 * — the worst kind of wrong, because nobody checks a spreadsheet for the rows
 * that are not there. `make` must build a FRESH query each call; reusing one
 * builder would re-run the same range.
 */
export async function fetchAll<Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  make: () => any,
  limit: number = EXPORT_LIMIT,
): Promise<{ rows: Row[]; error?: string; truncated: boolean }> {
  const rows: Row[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await make().range(from, to);
    if (error) return { rows, error: error.message, truncated: false };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: rows.length >= limit };
}
