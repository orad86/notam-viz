import { describe, it, expect } from 'vitest';
import type { Layer, Map as LeafletMap, Point } from 'leaflet';
import { notamsAtPoint, type LayerRegistry } from '@/components/map/hit-test';

// The module only ever calls `map.mouseEventToLayerPoint` and each layer's
// `_containsPoint`, so a stub of exactly that surface exercises the real code
// path without a DOM or a live Leaflet map. What is under test is the
// collection and ordering logic; the geometry itself is Leaflet's, already
// covered by Leaflet's own suite.
function stubMap(at: { x: number; y: number }): LeafletMap {
  return {
    mouseEventToLayerPoint: () => at as Point,
  } as unknown as LeafletMap;
}

/** A layer that reports a hit when the click lands inside an axis-aligned box. */
function boxLayer(x1: number, y1: number, x2: number, y2: number): Layer {
  return {
    _containsPoint: (p: Point) =>
      p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2,
  } as unknown as Layer;
}

// Never dereferenced — it is handed straight to the stubbed
// `mouseEventToLayerPoint`. Casting keeps these tests running under the plain
// node environment instead of dragging in jsdom for one constructor.
const CLICK = {} as MouseEvent;

describe('notamsAtPoint', () => {
  it('returns every NOTAM under the click, not just the topmost', () => {
    const registry: LayerRegistry = new Map([
      ['BIG', [boxLayer(0, 0, 100, 100)]],
      ['SMALL', [boxLayer(40, 40, 60, 60)]],
    ]);

    const hits = notamsAtPoint(
      stubMap({ x: 50, y: 50 }),
      CLICK,
      registry,
      ['BIG', 'SMALL'],
    );

    expect(hits).toHaveLength(2);
    expect(hits).toContain('BIG');
    expect(hits).toContain('SMALL');
  });

  // paintOrder is bottom-first, matching the order shapes are added to the map.
  // The user reads the last-drawn shape as "on top", so it must lead the result
  // — that is the one a single-hit click should focus.
  it('orders results topmost first', () => {
    const registry: LayerRegistry = new Map([
      ['BOTTOM', [boxLayer(0, 0, 100, 100)]],
      ['MIDDLE', [boxLayer(0, 0, 80, 80)]],
      ['TOP', [boxLayer(0, 0, 60, 60)]],
    ]);

    const hits = notamsAtPoint(
      stubMap({ x: 10, y: 10 }),
      CLICK,
      registry,
      ['BOTTOM', 'MIDDLE', 'TOP'],
    );

    expect(hits).toEqual(['TOP', 'MIDDLE', 'BOTTOM']);
  });

  it('returns an empty list for a click in open space', () => {
    const registry: LayerRegistry = new Map([
      ['A', [boxLayer(0, 0, 10, 10)]],
    ]);

    expect(
      notamsAtPoint(stubMap({ x: 500, y: 500 }), CLICK, registry, ['A']),
    ).toEqual([]);
  });

  // A multipoint NOTAM renders one layer per point. Hitting any of them means
  // hitting that NOTAM once, not once per point.
  it('reports a multi-layer NOTAM a single time', () => {
    const registry: LayerRegistry = new Map([
      [
        'MULTI',
        [boxLayer(0, 0, 10, 10), boxLayer(20, 20, 30, 30), boxLayer(40, 40, 50, 50)],
      ],
    ]);

    const hits = notamsAtPoint(
      stubMap({ x: 25, y: 25 }),
      CLICK,
      registry,
      ['MULTI'],
    );

    expect(hits).toEqual(['MULTI']);
  });

  // A NOTAM in paintOrder whose layers have unmounted (filtered out of the
  // list) must be skipped rather than throwing.
  it('skips ids with no registered layers', () => {
    const registry: LayerRegistry = new Map([['A', [boxLayer(0, 0, 100, 100)]]]);

    const hits = notamsAtPoint(
      stubMap({ x: 50, y: 50 }),
      CLICK,
      registry,
      ['GONE', 'A'],
    );

    expect(hits).toEqual(['A']);
  });

  // Non-path layers (a Marker, say) have no _containsPoint. They must be
  // ignored rather than crashing the whole hit test.
  it('ignores layers that cannot hit-test', () => {
    const registry: LayerRegistry = new Map([
      ['MARKER', [{} as unknown as Layer]],
      ['SHAPE', [boxLayer(0, 0, 100, 100)]],
    ]);

    const hits = notamsAtPoint(
      stubMap({ x: 50, y: 50 }),
      CLICK,
      registry,
      ['MARKER', 'SHAPE'],
    );

    expect(hits).toEqual(['SHAPE']);
  });
});
