import { describe, it, expect } from 'vitest';
import { getCategoryFromQLine, getCategoryFromQCode } from '@/lib/notam/qcodes';

describe('getCategoryFromQCode', () => {
  it('maps facility codes to airport', () => {
    expect(getCategoryFromQCode('FA')).toBe('airport');
    expect(getCategoryFromQCode('FR')).toBe('airport');
  });

  it('maps movement-area codes to runway', () => {
    expect(getCategoryFromQCode('MR')).toBe('runway');
    expect(getCategoryFromQCode('MA')).toBe('runway');
  });

  it('maps airspace-organization codes to airspace', () => {
    expect(getCategoryFromQCode('AA')).toBe('airspace');
    expect(getCategoryFromQCode('AE')).toBe('airspace');
  });

  it('falls through to other for unknown codes', () => {
    expect(getCategoryFromQCode('ZZ')).toBe('other');
  });

  it('is case-insensitive / trims whitespace', () => {
    expect(getCategoryFromQCode(' fa ')).toBe('airport');
  });
});

describe('getCategoryFromQLine', () => {
  // Pins the v0.3.x substring(1, 3) bug: match[1] is "FALC" and the subject
  // code is the first two letters ("FA"), not characters at positions 1–2 ("AL").
  it('extracts the ICAO subject-code from the first two letters of the 4-letter block', () => {
    expect(getCategoryFromQLine('LLLL/QFALC/IV/NBO/A/000/999/3200N03450E005')).toBe('airport');
    expect(getCategoryFromQLine('LLLL/QMRLC/IV/NBO/A/000/999/3200N03450E005')).toBe('runway');
    expect(getCategoryFromQLine('LLLL/QWULW/IV/NBO/W/000/999/3200N03450E005')).toBe('other');
    expect(getCategoryFromQLine('LLBG/QRDCA/IV/BO/W/000/999/3200N03450E005')).toBe('military');
  });

  it('returns other when no Q-code is present', () => {
    expect(getCategoryFromQLine('no q-line here')).toBe('other');
    expect(getCategoryFromQLine('')).toBe('other');
  });

  it('accepts lowercase Q-codes', () => {
    expect(getCategoryFromQLine('LLLL/qfalc/IV/NBO/A/000/999/3200N03450E005')).toBe('airport');
  });
});
