import { describe, it, expect } from 'vitest';
import { bboxArea } from '@/lib/notam/geometry';
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

describe('bboxArea', () => {
  it('returns 0 when geometry is null', () => {
    expect(bboxArea(makeNotam({ geometry: null }))).toBe(0);
  });

  it('returns 0 when geometry is not a polygon', () => {
    expect(
      bboxArea(makeNotam({ geometry: { type: 'point', lat: 32, lon: 35 } })),
    ).toBe(0);
  });

  it('returns 0 when the polygon has fewer than 2 vertices', () => {
    expect(
      bboxArea(makeNotam({ geometry: { type: 'polygon', vertices: [[32, 35]] } })),
    ).toBe(0);
  });

  it('returns lat-span × lon-span for a square polygon', () => {
    const square = makeNotam({
      geometry: {
        type: 'polygon',
        vertices: [
          [32, 34],
          [33, 34],
          [33, 35],
          [32, 35],
        ],
      },
    });
    // lat span: 33 - 32 = 1; lon span: 35 - 34 = 1; area = 1.
    expect(bboxArea(square)).toBeCloseTo(1);
  });

  it('returns the correct bbox area for a non-axis-aligned polygon', () => {
    const triangle = makeNotam({
      geometry: {
        type: 'polygon',
        vertices: [
          [31, 34],
          [33, 36],
          [32, 38],
        ],
      },
    });
    // lat span: 33 - 31 = 2; lon span: 38 - 34 = 4; area = 8.
    expect(bboxArea(triangle)).toBeCloseTo(8);
  });
});
