const fmt = new Intl.NumberFormat('en-US');

export interface BarRow {
  key: string;
  label: string;
  count: number;
  barClass: string;
  /** Draw a divider above this row. */
  divider?: boolean;
  note?: string;
  /** Leave this row out of the percentage column (e.g. bots, which are not part of `total`). */
  noPct?: boolean;
}

// Horizontal magnitude bars with the value as text beside them. Text stays in
// ink; the coloured bar carries identity.
export default function BarList({
  rows,
  max,
  total,
  empty,
}: {
  rows: BarRow[];
  max: number;
  /** When given, a percentage of this total is shown next to each count. */
  total?: number;
  empty: string;
}) {
  if (rows.every((r) => r.count === 0)) {
    return <p className="text-sm text-ink-3">{empty}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className={r.divider ? 'border-t border-dashed border-rule-strong pt-2.5' : ''}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">
              {r.label}
              {r.note && <span className="ms-1.5 text-2xs text-ink-3">{r.note}</span>}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">
              {fmt.format(r.count)}
              {total !== undefined && total > 0 && !r.noPct && (
                <span className="ms-2 inline-block w-9 text-end text-ink-3">
                  {Math.round((r.count / total) * 100)}%
                </span>
              )}
              {total !== undefined && r.noPct && <span className="ms-2 inline-block w-9" />}
            </span>
          </div>
          <div className="h-2 rounded-xs bg-paper-sunk">
            <div
              className={`h-full rounded-xs ${r.barClass}`}
              style={{ width: `${max > 0 ? Math.max(r.count > 0 ? 1 : 0, (r.count / max) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
