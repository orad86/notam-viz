import { describe, it, expect } from 'vitest';
import {
  haversineNm,
  pointToSegmentDistanceNm,
  notamMatchesRoute,
  notamOverlapsWindow,
  parseRouteInput,
  ROUTE_BUFFER_NM,
} from './route-filter';
import type { ParsedNotam } from '@/types/notam';

// Utility to build a minimal ParsedNotam for tests.
function makeNotam(partial: Partial<ParsedNotam>): ParsedNotam {
  return {
    notamId: 'A0001/26',
    id: 'A0001/26',
    fir: 'LLLL',
    qCode: 'QXXXX',
    eItem: '',
    effective: new Date('2026-01-01T00:00:00Z').toISOString(),
    expires: new Date('2026-12-31T23:59:59Z').toISOString(),
    subject: 'XX',
    geometry: null,
    category: 'other',
    isActive: true,
    title: 'test',
    rawText: '',
    ...partial,
  };
}

describe('parseRouteInput', () => {
  it('splits on whitespace, commas, arrows, and hyphens', () => {
    expect(parseRouteInput('LLBG LLHA')).toEqual(['LLBG', 'LLHA']);
    expect(parseRouteInput('LLBG,LLHA')).toEqual(['LLBG', 'LLHA']);
    expect(parseRouteInput('LLBG -> LLHA')).toEqual(['LLBG', 'LLHA']);
    expect(parseRouteInput('LLBG - LLHA')).toEqual(['LLBG', 'LLHA']);
  });

  it('drops empty tokens', () => {
    expect(parseRouteInput('  LLBG   LLHA  ')).toEqual(['LLBG', 'LLHA']);
  });
});

describe('haversineNm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineNm({ lat: 32, lon: 34 }, { lat: 32, lon: 34 })).toBeCloseTo(0, 3);
  });

  it('computes a known ~59 NM leg along a meridian', () => {
    // 1° of latitude ≈ 60 NM
    const d = haversineNm({ lat: 32, lon: 34 }, { lat: 33, lon: 34 });
    expect(d).toBeGreaterThan(59);
    expect(d).toBeLessThan(61);
  });
});

describe('pointToSegmentDistanceNm', () => {
  it('returns 0 when point is on the segment', () => {
    const d = pointToSegmentDistanceNm(
      { lat: 32.5, lon: 34 },
      { lat: 32, lon: 34 },
      { lat: 33, lon: 34 },
    );
    expect(d).toBeLessThan(0.1);
  });
});

describe('notamMatchesRoute', () => {
  const route = {
    points: [
      { code: 'A', lat: 32, lon: 34, source: 'airport' as const },
      { code: 'B', lat: 33, lon: 34, source: 'airport' as const },
    ],
    altitudeFt: 5000,
  };

  it('includes a NOTAM on the route corridor', () => {
    const notam = makeNotam({
      geometry: { type: 'point', lat: 32.5, lon: 34 },
      lowerLimit: 'GND',
      upperLimit: 'FL100',
    });
    expect(notamMatchesRoute(notam, route)).toBe(true);
  });

  it('excludes a NOTAM far from the route corridor', () => {
    const notam = makeNotam({
      geometry: { type: 'point', lat: 32.5, lon: 36 }, // ~100 NM east
      lowerLimit: 'GND',
      upperLimit: 'FL100',
    });
    expect(notamMatchesRoute(notam, route)).toBe(false);
  });

  it('excludes a NOTAM whose altitude band does not include the route altitude', () => {
    const notam = makeNotam({
      geometry: { type: 'point', lat: 32.5, lon: 34 },
      lowerLimit: 'FL200',
      upperLimit: 'FL300',
    });
    expect(notamMatchesRoute(notam, route)).toBe(false);
  });

  it('includes a circle NOTAM that intersects the corridor', () => {
    const notam = makeNotam({
      geometry: { type: 'circle', lat: 32.5, lon: 34.2, radiusNm: 20 },
      lowerLimit: 'GND',
      upperLimit: 'FL100',
    });
    expect(notamMatchesRoute(notam, route)).toBe(true);
  });

  it('returns true for all NOTAMs when route is empty', () => {
    const empty = { points: [], altitudeFt: 5000 };
    const notam = makeNotam({});
    expect(notamMatchesRoute(notam, empty)).toBe(true);
  });
});

describe('notamOverlapsWindow', () => {
  const from = '2026-06-01T00:00:00Z';
  const to = '2026-06-01T06:00:00Z';

  it('includes PERM NOTAMs whose start is before the window end', () => {
    expect(notamOverlapsWindow('2026-01-01T00:00:00Z', 'PERM', from, to)).toBe(true);
  });

  it('excludes NOTAMs that expire before the window start', () => {
    expect(
      notamOverlapsWindow('2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z', from, to),
    ).toBe(false);
  });

  it('excludes NOTAMs whose effective date is after the window ends', () => {
    expect(
      notamOverlapsWindow('2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', from, to),
    ).toBe(false);
  });
});

describe('ROUTE_BUFFER_NM', () => {
  it('is ~0.54 NM (1 km corridor)', () => {
    expect(ROUTE_BUFFER_NM).toBeCloseTo(1 / 1.852, 3);
  });
});
