import { describe, it, expect } from 'vitest';
import { parseNotamBlock, splitNotamBlocks } from '@/lib/notam/parser';

const MINIMAL_NOTAM = `A0001/26 NOTAMN
Q) LLLL/QFALC/IV/NBO/A/000/999/3200N03450E005
A) LLBG B) 2601010000 C) 2612312359
E) AERODROME LLBG CLOSED DUE RWY WORK`;

const PERM_NOTAM = `A0002/26 NOTAMN
Q) LLLL/QMRLC/IV/NBO/A/000/999/3200N03450E005
A) LLBG B) 2601010000 C) PERM
E) RWY 12/30 CLSD PERMANENTLY`;

const MULTI_LINE_E_NOTAM = `A0003/26 NOTAMN
Q) LLLL/QWULW/IV/NBO/W/000/999/3200N03450E005
A) LLLL B) 2601010000 C) 2601022359
E) TEMPORARY RESERVED AREA ACTIVE
LOWER LIMIT GND
UPPER LIMIT FL200`;

const MOBILE_LAYOUT_NOTAM = `A0004/26 NOTAMN Q) LLLL/QFALC/IV/NBO/A/000/999/3200N03450E005 A) LLBG B) 2601010000 C) PERM E) AERODROME CLOSED`;

const NO_QLINE_NOTAM = `A0005/26 NOTAMN
A) LLBG B) 2601010000 C) 2612312359
E) GENERIC NOTICE`;

describe('parseNotamBlock', () => {
  it('extracts NOTAM ID, location, validity', () => {
    const n = parseNotamBlock(MINIMAL_NOTAM);
    expect(n).not.toBeNull();
    expect(n?.notamId).toBe('A0001/26');
    expect(n?.id).toBe('A0001/26');
    expect(n?.location).toBe('LLBG');
    expect(n?.fir).toBe('LLLL');
  });

  // This pins the Q-code substring(0,2) fix: QFALC → airport (previously
  // broken by substring(1,3) → 'AL' → unknown → airspace via keyword fallback).
  it('categorizes QFALC as airport (Q-code subject fix)', () => {
    const n = parseNotamBlock(MINIMAL_NOTAM);
    expect(n?.category).toBe('airport');
  });

  it('categorizes QMRLC as runway', () => {
    const n = parseNotamBlock(PERM_NOTAM);
    expect(n?.category).toBe('runway');
  });

  it('preserves the PERM expiry sentinel', () => {
    const n = parseNotamBlock(PERM_NOTAM);
    expect(n?.expires).toBe('PERM');
    expect(n?.isActive).toBe(true);
  });

  it('parses multi-line E-items fully', () => {
    const n = parseNotamBlock(MULTI_LINE_E_NOTAM);
    expect(n?.eItem).toContain('TEMPORARY RESERVED AREA');
    expect(n?.eItem).toContain('UPPER LIMIT FL200');
    // Tightened fallback should still catch 'TEMPORARY RESERVED AREA' → airspace.
    expect(n?.category).toBe('airspace');
  });

  it('parses same-line mobile layout (A/B/C/E on one row)', () => {
    const n = parseNotamBlock(MOBILE_LAYOUT_NOTAM);
    expect(n).not.toBeNull();
    expect(n?.notamId).toBe('A0004/26');
    expect(n?.location).toBe('LLBG');
    expect(n?.category).toBe('airport');
  });

  it('still returns a NOTAM even when the Q-line is missing (falls back to A-line airport lookup)', () => {
    const n = parseNotamBlock(NO_QLINE_NOTAM);
    expect(n).not.toBeNull();
    // No Q-code → category comes from the keyword fallback (now narrow) or 'other'.
    expect(n?.category).toBe('other');
  });

  it('returns null when no NOTAM ID is present', () => {
    expect(parseNotamBlock('random text with no id pattern')).toBeNull();
  });
});

describe('splitNotamBlocks', () => {
  it('splits multiple NOTAM blocks', () => {
    const combined = MINIMAL_NOTAM + '\n' + PERM_NOTAM;
    const blocks = splitNotamBlocks(combined);
    expect(blocks).toHaveLength(2);
  });

  it('returns empty for garbage input', () => {
    expect(splitNotamBlocks('no notam ids here')).toEqual([]);
  });
});
