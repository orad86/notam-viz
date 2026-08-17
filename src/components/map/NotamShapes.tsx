'use client';

import { memo, useEffect, useRef } from 'react';
import { Circle, CircleMarker, Polygon } from 'react-leaflet';
import type { Layer } from 'leaflet';
import { ParsedNotam } from '@/types/notam';
import { FIR_SCALE_RADIUS_NM } from '@/lib/notam/format';
import type { LayerRegistry } from './hit-test';
import {
  CIRCLE_OPTIONS,
  FIR_SCALE_PIXEL_RADIUS,
  POINT_OPTIONS,
  POINT_PIXEL_RADIUS,
  POLYGON_OPTIONS,
  SHAPE_PROPS,
} from './constants';

interface ShapeProps {
  notam: ParsedNotam;
  registry: React.MutableRefObject<LayerRegistry>;
}

/**
 * Adds this component's Leaflet layer to the shared registry for as long as it
 * is mounted. The registry is what `notamsAtPoint` walks, and what
 * `pathElements` reads to apply focus/selection classes.
 *
 * Object refs (not callback refs) on purpose: react-leaflet's
 * `createLeafComponent` calls `useImperativeHandle` with no dependency array,
 * so a callback ref detaches and re-attaches on every render of the shape.
 */
function useRegisterLayer(
  id: string,
  registry: React.MutableRefObject<LayerRegistry>,
  ref: React.MutableRefObject<Layer | null>,
) {
  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;

    const existing = registry.current.get(id);
    if (existing) existing.push(layer);
    else registry.current.set(id, [layer]);

    const current = registry;
    return () => {
      const layers = current.current.get(id);
      if (!layers) return;
      const next = layers.filter((l) => l !== layer);
      if (next.length) current.current.set(id, next);
      else current.current.delete(id);
    };
  }, [id, registry, ref]);
}

const CircleShape = memo(function CircleShape({ notam, registry }: ShapeProps) {
  const ref = useRef<Layer | null>(null);
  useRegisterLayer(notam.id, registry, ref);

  if (notam.geometry?.type !== 'circle') return null;
  const { lat, lon, radiusNm } = notam.geometry;

  // A FIR-scale circle covers the whole map at useful zooms — drawn to scale it
  // is just a wash with an off-screen edge. Degrade it to a fixed-pixel dot so
  // it stays findable and stops swallowing clicks meant for the NOTAMs inside
  // it. Same treatment the previous implementation used.
  if (radiusNm >= FIR_SCALE_RADIUS_NM) {
    return (
      <CircleMarker
        {...SHAPE_PROPS}
        ref={ref as React.Ref<never>}
        center={[lat, lon]}
        radius={FIR_SCALE_PIXEL_RADIUS}
        pathOptions={CIRCLE_OPTIONS}
      />
    );
  }

  return (
    <Circle
      {...SHAPE_PROPS}
      ref={ref as React.Ref<never>}
      center={[lat, lon]}
      // Clamped at 200 NM so a mis-parsed radius cannot blow the projection up.
      radius={Math.min(radiusNm, 200) * 1852}
      pathOptions={CIRCLE_OPTIONS}
    />
  );
});

const PolygonShape = memo(function PolygonShape({ notam, registry }: ShapeProps) {
  const ref = useRef<Layer | null>(null);
  useRegisterLayer(notam.id, registry, ref);

  if (notam.geometry?.type !== 'polygon') return null;

  return (
    <Polygon
      {...SHAPE_PROPS}
      ref={ref as React.Ref<never>}
      positions={notam.geometry.vertices}
      pathOptions={POLYGON_OPTIONS}
    />
  );
});

/** One registered layer per point, so a click on any of them finds the NOTAM. */
const MultipointPin = memo(function MultipointPin({
  notam,
  registry,
  position,
}: ShapeProps & { position: [number, number] }) {
  const ref = useRef<Layer | null>(null);
  useRegisterLayer(notam.id, registry, ref);

  return (
    <CircleMarker
      {...SHAPE_PROPS}
      ref={ref as React.Ref<never>}
      center={position}
      radius={POINT_PIXEL_RADIUS}
      pathOptions={POINT_OPTIONS}
    />
  );
});

const MultipointShape = memo(function MultipointShape({
  notam,
  registry,
}: ShapeProps) {
  if (notam.geometry?.type !== 'multipoint') return null;

  return (
    <>
      {notam.geometry.points.map((pt, i) => (
        <MultipointPin
          key={`${notam.id}-${i}`}
          notam={notam}
          registry={registry}
          position={pt}
        />
      ))}
    </>
  );
});

const PointShape = memo(function PointShape({ notam, registry }: ShapeProps) {
  const ref = useRef<Layer | null>(null);
  useRegisterLayer(notam.id, registry, ref);

  if (notam.geometry?.type !== 'point') return null;
  const { lat, lon } = notam.geometry;

  // A CircleMarker rather than the default pin Marker. Two reasons: every NOTAM
  // is then a Path, so `_containsPoint` covers the whole hit-test uniformly with
  // no marker special case; and it drops the L.Icon.Default monkey-patch and the
  // /public/leaflet/marker-icon*.png files entirely. A dot also reads as chart
  // symbology where a Google-style teardrop does not.
  return (
    <CircleMarker
      {...SHAPE_PROPS}
      ref={ref as React.Ref<never>}
      center={[lat, lon]}
      radius={POINT_PIXEL_RADIUS}
      pathOptions={POINT_OPTIONS}
    />
  );
});

export function NotamShape({ notam, registry }: ShapeProps) {
  switch (notam.geometry?.type) {
    case 'circle':
      return <CircleShape notam={notam} registry={registry} />;
    case 'polygon':
      return <PolygonShape notam={notam} registry={registry} />;
    case 'multipoint':
      return <MultipointShape notam={notam} registry={registry} />;
    case 'point':
      return <PointShape notam={notam} registry={registry} />;
    default:
      return null;
  }
}
