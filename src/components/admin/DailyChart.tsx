import type { DailyPoint } from '@/lib/analytics/aggregate';
import { PLATFORM_LABELS, type Platform } from '@/lib/analytics/classify';
import { PLATFORM_BG } from './palette';

// Stacked daily bars as plain flex columns: crisp at any width, no SVG
// scaling of rounded corners, native `title` tooltips without client JS.
// Stack order (bottom to top) matches the legend order.

const SERIES: Exclude<Platform, 'bot'>[] = ['ios', 'android', 'web'];
const H = 180;

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function label(date: string) {
  return dayFmt.format(new Date(`${date}T00:00:00Z`));
}

// A round axis maximum: 1, 2, 5 x 10^n.
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

export default function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const max = niceMax(Math.max(0, ...daily.map((d) => d.total)));
  const ticks = [0, max / 2, max];
  const labelIdx = new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1]);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {SERIES.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-xs ${PLATFORM_BG[p]}`} aria-hidden />
            {PLATFORM_LABELS[p]}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <div
          className="relative w-8 shrink-0 font-mono text-2xs text-ink-3 tabular-nums"
          style={{ height: H }}
          aria-hidden
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute end-0 -translate-y-1/2"
              style={{ top: `${(1 - t / max) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: H }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-rule"
                style={{ top: `${(1 - t / max) * 100}%` }}
                aria-hidden
              />
            ))}
            <div
              className="relative flex h-full items-end gap-px"
              role="img"
              aria-label="Daily launches by platform"
            >
              {daily.map((d) => {
                const segs = SERIES.filter((p) => d[p] > 0);
                return (
                  <div
                    key={d.date}
                    className="flex h-full min-w-0 flex-1 flex-col-reverse gap-0.5 hover:opacity-80"
                    title={`${label(d.date)}: ${d.total} launches\n${SERIES.map((p) => `${PLATFORM_LABELS[p]} ${d[p]}`).join('\n')}`}
                  >
                    {segs.map((p, i) => (
                      <div
                        key={p}
                        className={`${PLATFORM_BG[p]} ${i === segs.length - 1 ? 'rounded-t-xs' : ''}`}
                        style={{ height: `${(d[p] / max) * 100}%` }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex gap-px font-mono text-2xs text-ink-3" aria-hidden>
            {daily.map((d, i) => (
              <span key={d.date} className="relative min-w-0 flex-1">
                {labelIdx.has(i) && (
                  <span
                    className={`absolute top-0 whitespace-nowrap ${
                      i === 0 ? 'start-0' : i === daily.length - 1 ? 'end-0' : 'start-1/2 -translate-x-1/2'
                    }`}
                  >
                    {label(d.date)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-8 text-xs">
        <summary className="cursor-pointer text-ink-2 hover:text-accent-text">Show as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full font-mono tabular-nums">
            <thead className="text-ink-3">
              <tr className="border-b border-rule text-start">
                <th className="py-1 text-start font-normal">Date</th>
                {SERIES.map((p) => (
                  <th key={p} className="py-1 text-end font-normal">
                    {PLATFORM_LABELS[p]}
                  </th>
                ))}
                <th className="py-1 text-end font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-b border-rule/60">
                  <td className="py-1">{d.date}</td>
                  {SERIES.map((p) => (
                    <td key={p} className="py-1 text-end">
                      {d[p]}
                    </td>
                  ))}
                  <td className="py-1 text-end font-medium">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
