// Resolving "which NOTAMs are under this click".
//
// Leaflet delivers a click to exactly ONE shape: `Map._findEventTargets` walks
// the DOM ancestor chain from the event target, and overlapping sibling paths
// are never ancestors of each other. That is why a NOTAM covered by another has
// always been unclickable here. So every NOTAM path is rendered
// `interactive: false`, clicks land on the map, and this module answers the
// question against every rendered layer at once.
//
// It delegates to Leaflet's own `_containsPoint` rather than re-deriving the
// geometry. That matters for correctness, not just effort: `L.Circle` has a
// metric radius projected through Web Mercator, so a haversine point-in-circle
// test would disagree with the ellipse actually drawn on screen — by a lot at
// this latitude for FIR-scale circles. Leaflet's version tests what the user
// can see, and folds in stroke click-tolerance for free.

import type { Layer, Map as LeafletMap, Point } from 'leaflet';

/** notamId -> every Leaflet layer rendered for it. Multipoints have several. */
export type LayerRegistry = Map<string, Layer[]>;

// `_containsPoint` and `_path` are Leaflet internals, absent from
// @types/leaflet. Narrowing through type guards keeps this free of `any`, which
// the repo's ESLint config treats as an error.
type HitTestable = Layer & { _containsPoint(p: Point): boolean };
type Pathed = Layer & { _path: SVGPathElement };

// Via `unknown` because Layer and these shapes have no declared overlap — the
// members are Leaflet internals that @types/leaflet does not model.
function isHitTestable(layer: Layer): layer is HitTestable {
  return (
    typeof (layer as unknown as Partial<HitTestable>)._containsPoint === 'function'
  );
}

// Duck-typed rather than `instanceof SVGPathElement`: that global does not
// exist under the node test environment, so referencing it would make this
// module unimportable outside a browser.
function isPathed(layer: Layer): layer is Pathed {
  const path = (layer as unknown as Partial<Pathed>)._path;
  return !!path && typeof path.classList === 'object';
}

/**
 * Every NOTAM id whose rendered geometry contains the click, topmost first.
 *
 * `paintOrder` is the order shapes were added to the map (bottom-first), so
 * reversing it matches what the user perceives as "the one on top" — which is
 * the one they meant when only a single NOTAM is under the cursor.
 */
export function notamsAtPoint(
  map: LeafletMap,
  originalEvent: MouseEvent,
  registry: LayerRegistry,
  paintOrder: readonly string[],
): string[] {
  const layerPoint = map.mouseEventToLayerPoint(originalEvent);
  const hits: string[] = [];

  for (const id of paintOrder) {
    const layers = registry.get(id);
    if (!layers) continue;

    for (const layer of layers) {
      if (isHitTestable(layer) && layer._containsPoint(layerPoint)) {
        hits.push(id);
        break; // one hit per NOTAM, however many layers it drew
      }
    }
  }

  return hits.reverse();
}

/**
 * The `<path>` elements currently rendered for a NOTAM.
 *
 * Read fresh on every call rather than cached: a NOTAM filtered out of the list
 * unmounts its layers, and holding stale element references would leak classes
 * onto recycled nodes.
 */
export function pathElements(
  registry: LayerRegistry,
  id: string | null,
): SVGPathElement[] {
  if (!id) return [];
  const layers = registry.get(id);
  if (!layers) return [];

  const paths: SVGPathElement[] = [];
  for (const layer of layers) {
    if (isPathed(layer)) paths.push(layer._path);
  }
  return paths;
}
