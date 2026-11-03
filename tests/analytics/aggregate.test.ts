import { describe, it, expect } from 'vitest';
import { summarize } from '@/lib/analytics/aggregate';
import type { DayCounts } from '@/lib/analytics/store';

const day = (date: string, fields: Record<string, number>): DayCounts => ({ date, fields });

describe('summarize', () => {
  // 2026-11-01 is a Sunday, 2026-11-02 a Monday.
  const current = [
    day('2026-11-01', { 'h:9:ios': 3, 'h:9:web': 1, 'h:3:bot': 7, 'city:Haifa': 4 }),
    day('2026-11-02', {
      'h:14:android': 2,
      'h:14:ios': 1,
      'city:Tel Aviv-Yafo': 2,
      'city:Haifa': 1,
    }),
  ];
  const previous = [day('2026-10-30', { 'h:8:web': 4 }), day('2026-10-31', {})];

  const s = summarize(current, previous, 10);

  it('totals human launches and keeps bots separate', () => {
    expect(s.total).toBe(7);
    expect(s.platforms).toEqual({ ios: 4, android: 2, web: 1, bot: 7 });
  });

  it('compares against the previous period', () => {
    expect(s.prevTotal).toBe(4);
    expect(s.changePct).toBeCloseTo(75);
  });

  it('reports the last day of the range as today', () => {
    expect(s.today).toBe(3);
  });

  it('builds a stacked daily series without bots', () => {
    expect(s.daily).toEqual([
      { date: '2026-11-01', ios: 3, android: 0, web: 1, total: 4 },
      { date: '2026-11-02', ios: 1, android: 2, web: 0, total: 3 },
    ]);
  });

  it('fills the weekday x hour heatmap from human launches only', () => {
    expect(s.heat[0][9]).toBe(4);
    expect(s.heat[0][3]).toBe(0);
    expect(s.heat[1][14]).toBe(3);
    expect(s.heatMax).toBe(4);
  });

  it('ranks cities and folds the tail into Other', () => {
    expect(summarize(current, [], 1)).toMatchObject({
      cities: [{ name: 'Haifa', count: 5 }],
      otherCities: 2,
    });
  });

  it('keeps colons inside city names', () => {
    const t = summarize([day('2026-11-01', { 'h:1:web': 1, 'city:A:B': 1 })], [], 10);
    expect(t.cities).toEqual([{ name: 'A:B', count: 1 }]);
  });

  it('ignores malformed fields', () => {
    const t = summarize(
      [day('2026-11-01', { 'h:25:ios': 9, 'h:x:ios': 9, 'h:3:tablet': 9, junk: 9, 'h:3:ios': 1 })],
      [],
      10,
    );
    expect(t.total).toBe(1);
  });

  it('returns a null change and zeros when there is no data', () => {
    const empty = summarize([day('2026-11-01', {})], [day('2026-10-31', {})], 10);
    expect(empty).toMatchObject({ total: 0, today: 0, changePct: null, heatMax: 0, otherCities: 0 });
    expect(empty.cities).toEqual([]);
  });
});
