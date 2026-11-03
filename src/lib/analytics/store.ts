import type { Redis } from '@upstash/redis';
import { STATS_KEY_PREFIX, STATS_TTL_SECONDS } from '@/lib/server/config';
import type { Platform } from './classify';
import { localTime } from './time';

// Redis layout for the usage counters. One hash per Israel-local day:
//
//   stats:2026-11-03
//     h:14:ios        -> 12    launches in the 14:00 hour from the iOS app
//     city:Haifa      -> 31    launches from Haifa (bots excluded)
//
// Counters only. No IP, no user agent, no per-launch record.

export interface DayCounts {
  date: string;
  fields: Record<string, number>;
}

export function statsKey(date: string): string {
  return `${STATS_KEY_PREFIX}${date}`;
}

// The hash fields one launch increments. Pure, so the layout is testable.
export function launchFields(
  platform: Platform,
  city: string,
  now: Date,
): { key: string; fields: string[] } {
  const { date, hour } = localTime(now);
  const fields = [`h:${hour}:${platform}`];
  // Bots are counted (so you can see how many there are) but are not a place.
  if (platform !== 'bot') fields.push(`city:${city}`);
  return { key: statsKey(date), fields };
}

export async function recordLaunch(
  redis: Redis,
  platform: Platform,
  city: string,
  now: Date = new Date(),
): Promise<void> {
  const { key, fields } = launchFields(platform, city, now);
  const p = redis.pipeline();
  for (const f of fields) p.hincrby(key, f, 1);
  p.expire(key, STATS_TTL_SECONDS);
  await p.exec();
}

export async function readDays(redis: Redis, dates: string[]): Promise<DayCounts[]> {
  if (dates.length === 0) return [];
  const p = redis.pipeline();
  for (const d of dates) p.hgetall(statsKey(d));
  const rows = await p.exec<(Record<string, unknown> | null)[]>();
  return dates.map((date, i) => {
    const fields: Record<string, number> = {};
    for (const [k, v] of Object.entries(rows[i] ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) fields[k] = n;
    }
    return { date, fields };
  });
}
