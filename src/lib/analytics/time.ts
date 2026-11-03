import { STATS_TZ } from '@/lib/server/config';

// Calendar arithmetic for the usage counters. Days and hours are Israel local
// time (STATS_TZ), because that is when the people using this fly. Dates are
// plain `YYYY-MM-DD` strings; arithmetic on them is done at UTC midnight so it
// never crosses a DST edge.

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: STATS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface LocalTime {
  date: string;
  hour: number;
  minute: number;
}

export function localTime(d: Date): LocalTime {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    // Some engines still emit "24" for midnight despite h23.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const DAY_MS = 86_400_000;

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

// The `n` dates ending at (and including) `end`, oldest first.
export function lastNDates(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

// 0 = Sunday. A calendar date's weekday does not depend on time zone.
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
