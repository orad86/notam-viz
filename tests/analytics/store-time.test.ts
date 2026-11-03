import { describe, it, expect } from 'vitest';
import { launchFields } from '@/lib/analytics/store';
import { addDays, lastNDates, localTime, weekdayOf } from '@/lib/analytics/time';

describe('localTime (Israel)', () => {
  it('applies IST (UTC+2) in winter', () => {
    expect(localTime(new Date('2026-11-03T12:30:00Z'))).toEqual({
      date: '2026-11-03',
      hour: 14,
      minute: 30,
    });
  });

  it('applies IDT (UTC+3) in summer and rolls the date over', () => {
    expect(localTime(new Date('2026-07-01T22:30:00Z'))).toEqual({
      date: '2026-07-02',
      hour: 1,
      minute: 30,
    });
  });

  it('reports midnight as hour 0', () => {
    expect(localTime(new Date('2026-11-02T22:00:00Z')).hour).toBe(0);
  });
});

describe('date arithmetic', () => {
  it('crosses month and leap boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists the last n dates oldest first, ending at the given day', () => {
    expect(lastNDates('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('computes the weekday of a calendar date (0 = Sunday)', () => {
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(weekdayOf('2026-11-03')).toBe(2);
  });
});

describe('launchFields', () => {
  const at = new Date('2026-11-03T12:30:00Z');

  it('increments the hour x platform counter and the city, keyed by Israel date', () => {
    expect(launchFields('ios', 'Haifa', at)).toEqual({
      key: 'stats:2026-11-03',
      fields: ['h:14:ios', 'city:Haifa'],
    });
  });

  it('does not attribute bots to a city', () => {
    expect(launchFields('bot', 'Ashburn', at).fields).toEqual(['h:14:bot']);
  });
});
