'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import { ParsedNotam } from '@/types/notam';
import { FIR_SCALE_RADIUS_NM } from '@/lib/notam/format';
import { getLeaflet } from './leaflet-setup';
import { notamsAtPoint, pathElements, type LayerRegistry } from './hit-test';
import { NOTAM_PANE, NOTAM_PANE_Z } from './constants';

/** Where the map should centre when focusing a NOTAM with no real extent. */
export function geometryAnchor(notam: ParsedNotam): LatLngTuple | null {
  const g = notam.geometry;
  if (!g) return null;
  switch (g.type) {
    case 'point':
    case 'circle':
      return [g.lat, g.lon];
    case 'polygon':
      return g.vertices[0] ?? null;
    case 'multipoint':
      return g.points[0] ?? null;
  }
}

function focusBounds(notam: ParsedNotam): LatLngBoundsExpression | null {
  const L = getLeaflet();
  const g = notam.geometry;
  if (!g) return null;

  switch (g.type) {
    case 'polygon':
      return L.latLngBounds(g.vertices);
    case 'multipoint':
      return L.latLngBounds(g.points);
    case 'circle':
      // A FIR-scale circle is drawn as a dot, so framing its true radius would
      // zoom out to nothing useful. Frame the dot instead.
      return g.radiusNm >= FIR_SCALE_RADIUS_NM
        ? L.latLng(g.lat, g.lon).toBounds(4000)
        : L.latLng(g.lat, g.lon).toBounds(Math.min(g.radiusNm, 200) * 1852 * 2);
    case 'point':
      return L.latLng(g.lat, g.lon).toBounds(4000);
  }
}

/**
 * Keeps Leaflet's idea of the container size in sync with the real one.
 *
 * The desktop detail panel takes 380px off the map's width, and Leaflet caches
 * container size — without this the tile grid and, more importantly, every
 * `containerPoint`/`layerPoint` conversion (which is what the hit test runs on)
 * would be stale by that amount, so clicks would resolve to the wrong place.
 *
 * A ResizeObserver rather than a transitionend listener: it also covers device
 * rotation and the mobile browser chrome collapsing.
 */
export function useInvalidateOnResize(): void {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;

    const observer = new ResizeObserver(() => {
      // Coalesce the burst of callbacks a CSS transition produces into one
      // invalidateSize per frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });

    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
}

/**
 * Creates the dedicated NOTAM pane.
 *
 * DURING RENDER, not in an effect. react-leaflet adds each shape's layer inside
 * that shape's own effect, and React runs child effects BEFORE the parent's — so
 * an effect here creates the pane too late, every shape falls back to the
 * default overlay pane, and none of the `.notam-pane` styling (colour, dimming,
 * focus, selection) matches anything.
 *
 * This shipped broken in v0.7.0 because dev masked it: StrictMode double-invokes
 * effects, so the pane existed by the second pass and localhost looked correct
 * while production had 128 paths in the wrong pane. Verify map work against
 * `next build && next start`, not `next dev`.
 *
 * The body is idempotent (getPane-or-create, and both writes are assignments),
 * so re-running it on a re-render is harmless.
 */
export function useNotamPane(): void {
  const map = useMap();
  useMemo(() => {
    const pane = map.getPane(NOTAM_PANE) ?? map.createPane(NOTAM_PANE);
    pane.style.zIndex = String(NOTAM_PANE_Z);
    pane.classList.add('notam-pane');
  }, [map]);
}

interface ClickProps {
  notams: ParsedNotam[];
  registry: React.MutableRefObject<LayerRegistry>;
  paintOrder: readonly string[];
  onSelectNotam: (n: ParsedNotam | null) => void;
  onToggleSelect: (id: string) => void;
  onStack: (ids: string[], at: { x: number; y: number }) => void;
}

export function MapClickHandler({
  notams,
  registry,
  paintOrder,
  onSelectNotam,
  onToggleSelect,
  onStack,
}: ClickProps) {
  const map = useMapEvents({
    click: (e) => {
      const ids = notamsAtPoint(map, e.originalEvent, registry.current, paintOrder);

      if (ids.length === 0) {
        onSelectNotam(null);
        return;
      }

      const byId = new Map(notams.map((n) => [n.id, n]));

      // Modifier-click keeps its historical meaning (toggle into the export
      // selection) on desktop. It is unreachable on touch by definition, which
      // is why selection is also exposed as a button in the detail sheet.
      const oe = e.originalEvent;
      if (oe.shiftKey || oe.metaKey || oe.ctrlKey) {
        onToggleSelect(ids[0]);
        return;
      }

      if (ids.length === 1) {
        const n = byId.get(ids[0]);
        if (n) onSelectNotam(n);
        return;
      }

      onStack(ids, { x: e.containerPoint.x, y: e.containerPoint.y });
    },
  });

  return null;
}

interface HighlightProps {
  focusedId: string | null;
  selectedIds: Set<string>;
  registry: React.MutableRefObject<LayerRegistry>;
  /**
   * Identity of the currently rendered shape set.
   *
   * Must change whenever ANY id changes, not merely when the count does — a
   * filter that swaps one NOTAM for another keeps the length equal, and keying
   * on length alone meant the classes were never reapplied to the freshly
   * mounted paths, so a selected NOTAM silently lost its outline.
   */
  revision: string;
}

/**
 * Drives focus and selection entirely through classList.
 *
 * Deliberately not through `pathOptions`: react-leaflet compares those by
 * reference, so a per-render object would call `setStyle()` on all ~114 shapes
 * every render. Here a focus change costs one classList write on the pane plus
 * a couple on the affected paths, and re-renders nothing.
 */
export function useShapeHighlight({
  focusedId,
  selectedIds,
  registry,
  revision,
}: HighlightProps): void {
  const map = useMap();
  const previous = useRef<SVGPathElement[]>([]);

  useEffect(() => {
    const pane = map.getPane(NOTAM_PANE);
    if (!pane) return;

    pane.classList.toggle('is-dimmed', focusedId !== null);

    for (const el of previous.current) el.classList.remove('is-focused');
    const next = pathElements(registry.current, focusedId);
    for (const el of next) el.classList.add('is-focused');
    previous.current = next;
  }, [focusedId, map, registry, revision]);

  useEffect(() => {
    // Re-read from the registry rather than caching element references: a NOTAM
    // filtered out of the list unmounts its layers, and a stale reference would
    // paint a class onto a recycled node.
    const touched: SVGPathElement[] = [];
    // Array.from rather than iterating the Set directly: tsconfig targets ES5
    // downlevel iteration, which would otherwise need a compiler flag change.
    for (const id of Array.from(selectedIds)) {
      for (const el of pathElements(registry.current, id)) {
        el.classList.add('is-selected');
        touched.push(el);
      }
    }
    return () => {
      for (const el of touched) el.classList.remove('is-selected');
    };
  }, [selectedIds, registry, revision]);
}

interface ControllerProps {
  selectedNotam: ParsedNotam | null;
  /** Pixels of chrome covering the map, so the shape lands in clear space. */
  padding: { right: number; bottom: number };
}

export function MapController({ selectedNotam, padding }: ControllerProps) {
  const map = useMap();

  useEffect(() => {
    if (!selectedNotam) return;
    const bounds = focusBounds(selectedNotam);
    if (!bounds) return;

    // flyTo has no padding options; flyToBounds does. That is what keeps the
    // focused shape clear of the bottom sheet on mobile and the side panel on
    // desktop instead of centring it underneath them.
    map.flyToBounds(bounds, {
      duration: 0.5,
      maxZoom: 11,
      paddingTopLeft: [16, 16],
      paddingBottomRight: [16 + padding.right, 16 + padding.bottom],
    });
  }, [selectedNotam, padding.right, padding.bottom, map]);

  return null;
}

/**
 * A single map-level label for the focused NOTAM.
 *
 * Replaces the old per-shape <Popup>, which minted one popup per shape — and
 * for a multipoint, one per point. Built imperatively because react-leaflet's
 * <Tooltip> requires an overlay-container ancestor and cannot be a direct child
 * of <MapContainer>.
 */
export function FocusLabel({ notam }: { notam: ParsedNotam | null }) {
  const map = useMap();

  useEffect(() => {
    const anchor = notam && geometryAnchor(notam);
    if (!notam || !anchor) return;

    const tooltip = getLeaflet()
      .tooltip({
        permanent: true,
        direction: 'top',
        className: 'notam-tag',
        interactive: false,
        offset: [0, -8],
      })
      .setLatLng(anchor)
      .setContent(notam.notamId)
      .addTo(map);

    return () => {
      tooltip.remove();
    };
  }, [notam, map]);

  return null;
}
