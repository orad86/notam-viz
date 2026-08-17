import type { PathOptions } from 'leaflet';

export type LayerKey = 'circle' | 'polygon' | 'point' | 'multipoint';
export type KmlKey = 'vfr' | 'ifr' | 'navaids' | 'airports';

/** Dedicated pane for NOTAM geometry, above the default overlay pane (400). */
export const NOTAM_PANE = 'notams';
export const NOTAM_PANE_Z = 410;

/**
 * Path options are FROZEN and shared.
 *
 * react-leaflet's `usePathOptions` compares by reference, so an object literal
 * built during render calls `setStyle()` on every shape on every render — with
 * ~114 NOTAMs that was the single largest cost in the old MapView. Focus and
 * selection are CSS classes now (see `.notam-pane` in globals.css), so nothing
 * here ever needs to change and these can be module constants.
 *
 * Stroke and fill COLOUR deliberately live in CSS, not here: presentation
 * attributes have zero specificity, so `.notam-pane path { stroke: var(--danger) }`
 * wins over whatever Leaflet writes. That keeps the palette in the token file
 * instead of hardcoding hex in TypeScript.
 */
const BASE: PathOptions = {
  pane: NOTAM_PANE,
  // Every NOTAM path is non-interactive. Leaflet delivers a click to exactly
  // one shape (it walks the DOM ancestor chain, and overlapping siblings are
  // never ancestors), so per-shape handlers can't disambiguate a stack. Instead
  // all clicks fall through to the map and `hit-test.ts` resolves them.
  interactive: false,
  weight: 2,
  opacity: 0.5,
  // Kept very low on purpose: ~95 circles overlap over central Israel, and fill
  // compounds where they stack. The stroke carries the boundary; the fill only
  // hints at interior. Reading one NOTAM out of the pile is the dim-on-focus
  // mechanism's job, not the fill's.
  fillOpacity: 0.04,
};

export const CIRCLE_OPTIONS: PathOptions = { ...BASE, className: 'notam-shape' };
export const POLYGON_OPTIONS: PathOptions = { ...BASE, className: 'notam-shape' };
export const POINT_OPTIONS: PathOptions = {
  ...BASE,
  weight: 2,
  fillOpacity: 0.9,
  className: 'notam-shape notam-point',
};

/** Circles at or above this radius are drawn as a fixed-pixel dot instead. */
export const FIR_SCALE_PIXEL_RADIUS = 6;
export const POINT_PIXEL_RADIUS = 6;

export const LAYER_META: Array<{ key: LayerKey; label: string }> = [
  { key: 'circle', label: 'Circles' },
  { key: 'polygon', label: 'Polygons' },
  { key: 'point', label: 'Points' },
  { key: 'multipoint', label: 'Multipoints' },
];

export const KML_META: Array<{
  key: KmlKey;
  label: string;
  url: string;
  iconType: 'airport' | 'vor' | 'vfr' | 'ifr';
}> = [
  { key: 'airports', label: 'Airports', url: '/kml/airports.kml', iconType: 'airport' },
  { key: 'navaids', label: 'Navaids', url: '/kml/navaids.kml', iconType: 'vor' },
  { key: 'vfr', label: 'VFR waypoints', url: '/kml/vfr_waypoints.kml', iconType: 'vfr' },
  { key: 'ifr', label: 'IFR waypoints', url: '/kml/ifr_waypoints.kml', iconType: 'ifr' },
];

/** Route corridor + polyline. Uses --nav (the "navigational" teal), not accent. */
export const ROUTE_COLOR = '#14666b';
