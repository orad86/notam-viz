import { isPlatform, type Platform } from './classify';
import type { DayCounts } from './store';
import { weekdayOf } from './time';

// Turns raw daily counter hashes into what the /admin dashboard draws. Pure.
// "Launches" everywhere means human launches: bots appear only in `platforms`.

export interface DailyPoint {
  date: string;
  ios: number;
  android: number;
  web: number;
  total: number;
}

export interface CityRow {
  name: string;
  count: number;
}

export interface UsageSummary {
  total: number;
  prevTotal: number;
  /** Percent change against the previous period; null when it had no launches. */
  changePct: number | null;
  /** Launches on the last day of the range, i.e. today. */
  today: number;
  daily: DailyPoint[];
  /** heat[weekday 0=Sun][hour 0-23] */
  heat: number[][];
  heatMax: number;
  platforms: Record<Platform, number>;
  cities: CityRow[];
  otherCities: number;
}

interface DayTally {
  byPlatform: Record<Platform, number>;
  byHour: number[];
  cities: Map<string, number>;
}

function tallyDay(fields: Record<string, number>): DayTally {
  const byPlatform: Record<Platform, number> = { ios: 0, android: 0, web: 0, bot: 0 };
  const byHour = new Array<number>(24).fill(0);
  const cities = new Map<string, number>();
  for (const [field, count] of Object.entries(fields)) {
    if (field.startsWith('h:')) {
      const [, hourStr, platform] = field.split(':');
      const hour = Number(hourStr);
      if (!platform || !isPlatform(platform) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        continue;
      }
      byPlatform[platform] += count;
      if (platform !== 'bot') byHour[hour] += count;
    } else if (field.startsWith('city:')) {
      // City names may contain ':', so only the prefix is split off.
      const name = field.slice('city:'.length);
      cities.set(name, (cities.get(name) ?? 0) + count);
    }
  }
  return { byPlatform, byHour, cities };
}

function humans(p: Record<Platform, number>): number {
  return p.ios + p.android + p.web;
}

export function summarize(
  current: DayCounts[],
  previous: DayCounts[],
  topCities: number,
): UsageSummary {
  const platforms: Record<Platform, number> = { ios: 0, android: 0, web: 0, bot: 0 };
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const cityTotals = new Map<string, number>();
  const daily: DailyPoint[] = [];

  for (const day of current) {
    const t = tallyDay(day.fields);
    for (const p of Object.keys(platforms) as Platform[]) platforms[p] += t.byPlatform[p];
    const wd = weekdayOf(day.date);
    t.byHour.forEach((n, h) => {
      heat[wd][h] += n;
    });
    t.cities.forEach((n, name) => cityTotals.set(name, (cityTotals.get(name) ?? 0) + n));
    daily.push({
      date: day.date,
      ios: t.byPlatform.ios,
      android: t.byPlatform.android,
      web: t.byPlatform.web,
      total: humans(t.byPlatform),
    });
  }

  const prevTotal = previous.reduce((sum, d) => sum + humans(tallyDay(d.fields).byPlatform), 0);
  const total = humans(platforms);
  const sorted = Array.from(cityTotals.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    total,
    prevTotal,
    changePct: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
    today: daily.at(-1)?.total ?? 0,
    daily,
    heat,
    heatMax: Math.max(0, ...heat.flat()),
    platforms,
    cities: sorted.slice(0, topCities),
    otherCities: sorted.slice(topCities).reduce((s, c) => s + c.count, 0),
  };
}
