import { describe, it, expect } from 'vitest';
import {
  parseAltitudeFt,
  parseQLineAltitudeFt,
  altitudeBandFt,
} from '@/lib/notam/altitude';

describe('parseAltitudeFt', () => {
  it('parses flight levels (FL100 -> 10000 ft)', () => {
    expect(parseAltitudeFt('FL100')).toBe(10000);
  });

  it('treats a bare number as feet (pilot input convention)', () => {
    expect(parseAltitudeFt('5500')).toBe(5500);
  });

  it('strips spaces and unit suffixes', () => {
    expect(parseAltitudeFt('5500 FT')).toBe(5500);
    expect(parseAltitudeFt('5500FT')).toBe(5500);
    expect(parseAltitudeFt('5500 FEET')).toBe(5500);
  });

  it('is case-insensitive', () => {
    expect(parseAltitudeFt('fl080')).toBe(8000);
  });

  it('returns 0 for ground sentinels', () => {
    expect(parseAltitudeFt('SFC')).toBe(0);
    expect(parseAltitudeFt('GND')).toBe(0);
    expect(parseAltitudeFt('MSL')).toBe(0);
  });

  it('returns Infinity for unlimited sentinels', () => {
    expect(parseAltitudeFt('UNL')).toBe(Infinity);
    expect(parseAltitudeFt('UNLIMITED')).toBe(Infinity);
    expect(parseAltitudeFt('UNLTD')).toBe(Infinity);
  });

  it('converts meters to feet (rounded)', () => {
    expect(parseAltitudeFt('1500 M')).toBe(Math.round(1500 * 3.28084));
  });

  it('returns null for empty / undefined / garbage', () => {
    expect(parseAltitudeFt('')).toBeNull();
    expect(parseAltitudeFt(undefined)).toBeNull();
    expect(parseAltitudeFt('abc')).toBeNull();
  });
});

describe('parseQLineAltitudeFt', () => {
  it('treats 3-digit codes as hundreds of feet', () => {
    expect(parseQLineAltitudeFt('000')).toBe(0);
    expect(parseQLineAltitudeFt('005')).toBe(500);
    expect(parseQLineAltitudeFt('180')).toBe(18000);
  });

  it('returns Infinity for the 999 unlimited sentinel', () => {
    expect(parseQLineAltitudeFt('999')).toBe(Infinity);
  });

  it('forwards SFC/UNL to parseAltitudeFt', () => {
    expect(parseQLineAltitudeFt('SFC')).toBe(0);
    expect(parseQLineAltitudeFt('UNL')).toBe(Infinity);
  });

  it('falls through to parseAltitudeFt for non-3-digit input', () => {
    // 4-digit "5500" must NOT be treated as 550000 ft.
    expect(parseQLineAltitudeFt('5500')).toBe(5500);
    expect(parseQLineAltitudeFt('FL100')).toBe(10000);
  });

  it('returns null for empty / undefined / garbage', () => {
    expect(parseQLineAltitudeFt(undefined)).toBeNull();
    expect(parseQLineAltitudeFt('')).toBeNull();
    expect(parseQLineAltitudeFt('abc')).toBeNull();
  });
});

describe('altitudeBandFt', () => {
  it('returns parsed lower and upper for valid inputs', () => {
    expect(altitudeBandFt('100', '180')).toEqual({ lower: 10000, upper: 18000 });
  });

  it('defaults missing/unparseable lower to 0', () => {
    expect(altitudeBandFt(undefined, '180')).toEqual({ lower: 0, upper: 18000 });
    expect(altitudeBandFt('xxx', '180')).toEqual({ lower: 0, upper: 18000 });
  });

  it('defaults missing/unparseable upper to Infinity', () => {
    expect(altitudeBandFt('100', undefined)).toEqual({ lower: 10000, upper: Infinity });
    expect(altitudeBandFt('100', 'xxx')).toEqual({ lower: 10000, upper: Infinity });
  });

  it('returns the full band when both are missing', () => {
    expect(altitudeBandFt(undefined, undefined)).toEqual({
      lower: 0,
      upper: Infinity,
    });
  });

  it('treats 999 as Infinity for the upper bound', () => {
    expect(altitudeBandFt('100', '999')).toEqual({ lower: 10000, upper: Infinity });
  });
});
