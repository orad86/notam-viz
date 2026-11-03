import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import { ADMIN_COOKIE, adminConfig, verifySession } from '@/lib/admin/session';
import { summarize, type UsageSummary } from '@/lib/analytics/aggregate';
import { PLATFORMS, PLATFORM_LABELS } from '@/lib/analytics/classify';
import { readDays } from '@/lib/analytics/store';
import { addDays, lastNDates, localTime } from '@/lib/analytics/time';
import { getRedis } from '@/lib/server/redis';
import { STATS_TOP_CITIES, STATS_TZ } from '@/lib/server/config';
import { log } from '@/lib/server/log';
import Panel from '@/components/admin/Panel';
import KpiTile from '@/components/admin/KpiTile';
import DailyChart from '@/components/admin/DailyChart';
import Heatmap from '@/components/admin/Heatmap';
import BarList from '@/components/admin/BarList';
import { PLATFORM_BG } from '@/components/admin/palette';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function parseRange(raw: string | undefined): Range {
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

const stampFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: STATS_TZ,
});

async function load(range: Range, today: string): Promise<UsageSummary | null> {
  const redis = getRedis();
  if (!redis) return null;
  const current = lastNDates(today, range);
  const previous = lastNDates(addDays(today, -range), range);
  try {
    const days = await readDays(redis, [...current, ...previous]);
    return summarize(days.slice(0, range), days.slice(range), STATS_TOP_CITIES);
  } catch (err) {
    log('error', 'admin.stats.read_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  // The middleware already gates this; re-check so a matcher mistake can
  // never expose the page.
  const cfg = adminConfig();
  if (!cfg) notFound();
  if (!(await verifySession(cookies().get(ADMIN_COOKIE)?.value, cfg.secret))) {
    redirect('/admin/login');
  }

  const range = parseRange(searchParams.range);
  const now = new Date();
  const { date: today, hour, minute } = localTime(now);
  const s = await load(range, today);
  const periodNoun = `${range} days`;

  return (
    <>
      <header className="safe-top sticky top-0 z-10 border-b border-rule bg-paper-raised">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-2 px-4">
          <span className="font-display text-base font-semibold tracking-tight">NOTAM Visualizer</span>
          <span className="text-ink-3" aria-hidden>
            /
          </span>
          <span className="text-sm text-ink-3">Usage</span>
          <form action={logout} className="ms-auto">
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-2 transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <LogOut className="size-3.5" aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Usage</h1>
            <p className="mt-0.5 text-xs text-ink-3">
              Israel time · as of {stampFmt.format(now)}
            </p>
          </div>
          <nav aria-label="Range" className="flex gap-1 rounded-pill border border-rule bg-paper-raised p-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin?range=${r}`}
                // Each render reads up to 180 Redis hashes; don't spend them on prefetch.
                prefetch={false}
                aria-current={r === range ? 'page' : undefined}
                className={clsx(
                  'rounded-pill px-3 py-1 font-mono text-xs tabular-nums transition-colors',
                  r === range ? 'bg-ink text-ink-inverse' : 'text-ink-2 hover:bg-paper-sunk',
                )}
              >
                {r}d
              </Link>
            ))}
          </nav>
        </div>

        {!s ? (
          <p role="alert" className="rounded-md border border-rule bg-danger-wash px-4 py-3 text-sm">
            Usage data is unavailable: the Redis store is not configured or could not be reached.
            Check the server logs for <code>admin.stats.read_failed</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <KpiTile
                label={`Launches · last ${periodNoun}`}
                value={s.total}
                note={periodNoun}
                changePct={s.changePct}
              />
              <KpiTile
                label="Launches · today"
                value={s.today}
                note={`so far, by ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
              />
            </div>

            <Panel label="When" title="Daily launches">
              {s.total === 0 ? (
                <p className="text-sm text-ink-3">No launches recorded in this range yet.</p>
              ) : (
                <DailyChart daily={s.daily} />
              )}
            </Panel>

            <Panel label="When" title="Weekday × hour">
              <Heatmap heat={s.heat} max={s.heatMax} />
            </Panel>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel label="How" title="Platform">
                <BarList
                  empty="No launches recorded in this range yet."
                  total={s.total}
                  max={Math.max(...PLATFORMS.map((p) => s.platforms[p]))}
                  rows={PLATFORMS.map((p) => ({
                    key: p,
                    label: PLATFORM_LABELS[p],
                    count: s.platforms[p],
                    barClass: PLATFORM_BG[p],
                    divider: p === 'bot',
                    noPct: p === 'bot',
                    note: p === 'bot' ? 'not counted as launches' : undefined,
                  }))}
                />
              </Panel>

              <Panel label="Where" title="Top cities">
                <BarList
                  empty="No launches recorded in this range yet."
                  max={Math.max(0, ...s.cities.map((c) => c.count), s.otherCities)}
                  rows={[
                    ...s.cities.map((c) => ({
                      key: c.name,
                      label: c.name,
                      count: c.count,
                      barClass: 'bg-ink-2',
                    })),
                    ...(s.otherCities > 0
                      ? [
                          {
                            key: '__other',
                            label: 'Other',
                            count: s.otherCities,
                            barClass: 'bg-rule-strong',
                            divider: true,
                          },
                        ]
                      : []),
                  ]}
                />
              </Panel>
            </div>

            <p className="pt-2 text-2xs text-ink-3">
              Anonymous counts of app launches (one per NOTAM fetch). No IPs or identifiers are stored.
              Location is the city from IP geolocation.
            </p>
          </>
        )}
      </main>
    </>
  );
}
