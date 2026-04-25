import { describe, it, expect } from 'vitest';
import {
  formatUtcDate,
  eItemText,
  formatAltitudeRange,
  formatScope,
  formatTraffic,
  getCategoryColor,
} from '@/lib/notam/format';
import type { ParsedNotam } from '@/types/notam';

function makeNotam(partial: Partial<ParsedNotam>): ParsedNotam {
  return {
    notamId: 'A0001/26',
    id: 'A0001/26',
    fir: 'LLLL',
    qCode: 'QXXXX',
    eItem: '',
    effective: new Date('2026-01-01T00:00:00Z').toISOString(),
    expires: 'PERM',
    subject: 'XX',
    geometry: null,
    category: 'other',
    isActive: false,
    title: 'test',
    rawText: '',
    ...partial,
  };
}

describe('formatUtcDate', () => {
  it('formats a valid ISO timestamp as YYYY-MM-DD HHMMZ', () => {
    expect(formatUtcDate('2026-01-02T03:04:00Z')).toBe('2026-01-02 0304Z');
  });

  it('zero-pads single-digit fields', () => {
    expect(formatUtcDate('2026-09-09T09:09:00Z')).toBe('2026-09-09 0909Z');
  });

  // Behavior on an unparseable string is currently broken (returns
  // 'NaN-NaN-NaN NaNNaNZ' instead of the input — `new Date(bad)` returns
  // Invalid Date, doesn't throw, so the catch is dead). Tracked separately;
  // not pinned here so this PR doesn't lock in the bad behavior.
});

describe('eItemText', () => {
  it('strips the leading E) marker', () => {
    expect(eItemText(makeNotam({ eItem: 'E) hello world' }))).toBe('hello world');
  });

  it('strips inline E) markers defensively', () => {
    expect(eItemText(makeNotam({ eItem: 'first E) second' }))).toBe('first second');
  });

  it('returns empty string when eItem is empty', () => {
    expect(eItemText(makeNotam({ eItem: '' }))).toBe('');
  });

  it('preserves internal newlines (no whitespace collapse)', () => {
    expect(eItemText(makeNotam({ eItem: 'E) line one\nline two' }))).toBe(
      'line one\nline two',
    );
  });
});

describe('formatAltitudeRange', () => {
  it('joins fLine and gLine with an arrow when both are set', () => {
    expect(formatAltitudeRange(makeNotam({ fLine: 'GND', gLine: 'FL080' }))).toBe(
      'GND → FL080',
    );
  });

  it('strips a trailing close-paren from f/g lines', () => {
    expect(formatAltitudeRange(makeNotam({ fLine: 'GND)', gLine: 'FL080)' }))).toBe(
      'GND → FL080',
    );
  });

  it('returns the single set f/g line when only one is present', () => {
    expect(formatAltitudeRange(makeNotam({ fLine: 'GND', gLine: undefined }))).toBe(
      'GND',
    );
    expect(formatAltitudeRange(makeNotam({ fLine: undefined, gLine: 'FL080' }))).toBe(
      'FL080',
    );
  });

  it('falls back to FL<lower> → FL<upper> when f/g are absent', () => {
    expect(
      formatAltitudeRange(makeNotam({ lowerLimit: '000', upperLimit: '180' })),
    ).toBe('FL000 → FL180');
  });

  it('returns the single set Q-line limit when only one is present', () => {
    expect(
      formatAltitudeRange(makeNotam({ lowerLimit: '000', upperLimit: undefined })),
    ).toBe('000');
  });

  it('returns null when nothing is set', () => {
    expect(formatAltitudeRange(makeNotam({}))).toBeNull();
  });
});

describe('formatScope', () => {
  it('maps single letters to human labels', () => {
    expect(formatScope('A')).toBe('Aerodrome');
    expect(formatScope('E')).toBe('En-route');
    expect(formatScope('W')).toBe('Warning');
  });

  it('returns the combined label when both A and E are present', () => {
    expect(formatScope('AE')).toBe('Aerodrome + En-route');
    expect(formatScope('EA')).toBe('Aerodrome + En-route');
  });

  it('returns null for empty / undefined', () => {
    expect(formatScope('')).toBeNull();
    expect(formatScope(undefined)).toBeNull();
  });

  it('returns the uppercased input as-is for unknown letters', () => {
    expect(formatScope('z')).toBe('Z');
  });
});

describe('formatTraffic', () => {
  it('maps significance codes to human labels', () => {
    expect(formatTraffic('I')).toBe('IFR');
    expect(formatTraffic('V')).toBe('VFR');
    expect(formatTraffic('IV')).toBe('IFR/VFR');
  });

  it('returns null for empty / undefined', () => {
    expect(formatTraffic('')).toBeNull();
    expect(formatTraffic(undefined)).toBeNull();
  });

  it('returns the uppercased input as-is for unknown values', () => {
    expect(formatTraffic('x')).toBe('X');
  });
});

describe('getCategoryColor', () => {
  it('returns the documented hex for each known category', () => {
    expect(getCategoryColor('airspace')).toBe('#3b82f6');
    expect(getCategoryColor('obstacle')).toBe('#ef4444');
    expect(getCategoryColor('navaid')).toBe('#a855f7');
    expect(getCategoryColor('runway')).toBe('#f59e0b');
    expect(getCategoryColor('airport')).toBe('#22c55e');
    expect(getCategoryColor('procedure')).toBe('#06b6d4');
    expect(getCategoryColor('military')).toBe('#8b5cf6');
  });

  it('returns the default gray for unknown categories', () => {
    expect(getCategoryColor('other')).toBe('#6b7280');
    expect(getCategoryColor('totally-made-up')).toBe('#6b7280');
  });
});
