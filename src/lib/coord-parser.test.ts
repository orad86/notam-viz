import { describe, it, expect } from 'vitest';
import {
  parseCoordinatePair,
  parseQLineCoordinate,
  extractCoordinatesFromBody,
  dmsToDec,
  dmToDecimal,
} from './coord-parser';

describe('dmsToDec / dmToDecimal', () => {
  it('converts DMS N/E correctly', () => {
    expect(dmsToDec(32, 0, 0, 'N')).toBeCloseTo(32);
    expect(dmsToDec(34, 30, 0, 'E')).toBeCloseTo(34.5);
  });

  it('negates for S/W', () => {
    expect(dmsToDec(32, 0, 0, 'S')).toBeCloseTo(-32);
    expect(dmToDecimal(34, 30, 'W')).toBeCloseTo(-34.5);
  });
});

describe('parseQLineCoordinate', () => {
  it('parses DMS with explicit separator and radius', () => {
    const r = parseQLineCoordinate('320000N/0344500E/005');
    expect(r).not.toBeNull();
    expect(r?.type).toBe('circle');
    expect(r?.lat).toBeCloseTo(32, 4);
    expect(r?.lon).toBeCloseTo(34.75, 4);
    expect(r?.radiusNm).toBe(5);
  });

  it('parses DM-only format (compact, no separator before radius)', () => {
    const r = parseQLineCoordinate('3200N03453E005');
    expect(r).not.toBeNull();
    expect(r?.type).toBe('circle');
    expect(r?.lat).toBeCloseTo(32, 4);
    expect(r?.lon).toBeCloseTo(34 + 53 / 60, 4);
    expect(r?.radiusNm).toBe(5);
  });

  it('returns point when no radius present', () => {
    const r = parseQLineCoordinate('3200N03453E');
    expect(r?.type).toBe('point');
    expect(r?.radiusNm).toBe(0);
  });

  it('rejects coords outside Israeli airspace', () => {
    expect(parseQLineCoordinate('500000N0050000E005')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseQLineCoordinate('not a coord')).toBeNull();
    expect(parseQLineCoordinate('')).toBeNull();
  });
});

describe('parseCoordinatePair', () => {
  it('handles DMS with a slash between lat and lon', () => {
    const r = parseCoordinatePair('320000N/0344500E');
    expect(r).not.toBeNull();
    expect(r?.[0]).toBeCloseTo(32, 4);
    expect(r?.[1]).toBeCloseTo(34.75, 4);
  });
});

describe('extractCoordinatesFromBody', () => {
  it('extracts a single PSN coord as a point', () => {
    const geom = extractCoordinatesFromBody('CRANE ERECTED PSN 314945N0344500E HGT 50M');
    expect(geom?.type).toBe('point');
    if (geom?.type === 'point') {
      expect(geom.lat).toBeCloseTo(31.8292, 3);
    }
  });

  it('extracts two PSN coords as a polygon (not self-intersecting)', () => {
    const geom = extractCoordinatesFromBody(
      'AREA PSN 314945N0344500E PSN 315000N0345000E PSN 320000N0344500E',
    );
    // Three non-collinear points → polygon
    expect(geom?.type).toBe('polygon');
  });

  it('picks up standalone letter-first coords (pattern 1c) even when a PSN coord already matched', () => {
    // Previously gated on `coords.length === 0` which silently dropped these.
    const geom = extractCoordinatesFromBody(
      'AREA PSN 314945N0344500E BOUNDED BY:\nN320000E0345000\nN315000E0344500',
    );
    // Expect a polygon with 3 vertices, not just the 1 PSN point.
    expect(geom?.type).toBe('polygon');
    if (geom?.type === 'polygon') {
      expect(geom.vertices.length).toBe(3);
    }
  });

  it('deduplicates identical lat/lon emitted by multiple patterns', () => {
    // Same point appears both as "PSN 314945N0344500E" and standalone — dedup
    // should collapse to a single point.
    const geom = extractCoordinatesFromBody('PSN 314945N0344500E CRANE');
    expect(geom?.type).toBe('point');
  });

  it('returns null when no valid Israeli coords are found', () => {
    expect(extractCoordinatesFromBody('NO COORDINATES HERE')).toBeNull();
  });
});
