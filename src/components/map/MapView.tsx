'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
} from 'react-leaflet';
import { ParsedNotam } from '@/types/notam';
import { FIR_SCALE_RADIUS_NM } from '@/lib/notam/format';
import { bboxArea } from '@/lib/notam/geometry';
import {
  Route,
  buildCorridorPolygon,
  ROUTE_BUFFER_NM,
  ROUTE_BUFFER_KM,
} from '@/lib/notam/route-filter';
import type { DeviceFix } from '@/hooks/useDeviceLocation';
import KmlLayer from '../KmlLayer';
import UserLocationLayer from '../UserLocationLayer';
import LayerPanel from './LayerPanel';
import SelectionToolbar from './SelectionToolbar';
import StackPicker from './StackPicker';
import { NotamShape } from './NotamShapes';
import type { LayerRegistry } from './hit-test';
import {
  FocusLabel,
  MapClickHandler,
  MapController,
  useInvalidateOnResize,
  useNotamPane,
  useShapeHighlight,
} from './MapInteractions';
import {
  KML_META,
  ROUTE_COLOR,
  type KmlKey,
  type LayerKey,
} from './constants';

interface MapViewProps {
  notams: ParsedNotam[];
  onSelectNotam: (notam: ParsedNotam | null) => void;
  selectedNotam: ParsedNotam | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  /**
   * Focus without committing, used by the stack stepper. Distinct from
   * onSelectNotam so browsing a stack can keep the detail surface out of the
   * way instead of expanding it over the map and the picker.
   */
  onPreviewNotam: (notam: ParsedNotam) => void;
  route: Route | null;
  userLocation?: DeviceFix | null;
  /** Chrome covering the map, so fly-to lands the shape in clear space. */
  focusPadding: { right: number; bottom: number };
}

interface MapLayersProps {
  ordered: ParsedNotam[];
  paintOrder: string[];
  registry: React.MutableRefObject<LayerRegistry>;
  visible: Record<LayerKey, boolean>;
  shapeRevision: string;
  selectedNotam: ParsedNotam | null;
  selectedIds: Set<string>;
  onSelectNotam: (n: ParsedNotam | null) => void;
  onToggleSelect: (id: string) => void;
  onStack: (ids: string[], at: { x: number; y: number }) => void;
  focusPadding: { right: number; bottom: number };
}

/** Everything that has to live inside <MapContainer> to reach the map instance. */
function MapLayers({
  ordered,
  paintOrder,
  registry,
  visible,
  shapeRevision,
  selectedNotam,
  selectedIds,
  onSelectNotam,
  onToggleSelect,
  onStack,
  focusPadding,
}: MapLayersProps) {
  useNotamPane();
  useInvalidateOnResize();
  useShapeHighlight({
    focusedId: selectedNotam?.id ?? null,
    selectedIds,
    registry,
    revision: shapeRevision,
  });

  return (
    <>
      <MapClickHandler
        notams={ordered}
        registry={registry}
        paintOrder={paintOrder}
        onSelectNotam={onSelectNotam}
        onToggleSelect={onToggleSelect}
        onStack={onStack}
      />
      <MapController selectedNotam={selectedNotam} padding={focusPadding} />
      <FocusLabel notam={selectedNotam} />

      {ordered
        .filter((n) => n.geometry && visible[n.geometry.type])
        .map((n) => (
          <NotamShape key={n.id} notam={n} registry={registry} />
        ))}
    </>
  );
}

export default function MapView({
  notams,
  onSelectNotam,
  selectedNotam,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onPreviewNotam,
  route,
  userLocation,
  focusPadding,
}: MapViewProps) {
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    circle: true,
    polygon: true,
    point: true,
    multipoint: true,
  });
  const [kmlVisible, setKmlVisible] = useState<Record<KmlKey, boolean>>({
    vfr: false,
    ifr: false,
    navaids: false,
    airports: false,
  });
  const [kmlCounts, setKmlCounts] = useState<Record<KmlKey, number>>({
    vfr: 0,
    ifr: 0,
    navaids: 0,
    airports: 0,
  });
  const [stack, setStack] = useState<{
    ids: string[];
    at: { x: number; y: number };
  } | null>(null);

  const registry = useRef<LayerRegistry>(new Map());

  const handleKmlCount = useCallback((key: KmlKey, count: number) => {
    setKmlCounts((prev) => (prev[key] === count ? prev : { ...prev, [key]: count }));
  }, []);

  // Paint order is also stacking order: biggest first so it sits at the back and
  // the small shapes on top of it stay clickable. `notamsAtPoint` reverses this
  // to answer "topmost first".
  const ordered = useMemo(() => {
    const withGeometry = notams.filter((n) => n.geometry);
    return [...withGeometry].sort((a, b) => area(b) - area(a));
  }, [notams]);

  const paintOrder = useMemo(() => ordered.map((n) => n.id), [ordered]);

  // Identity of the rendered set, for the highlight effect. Joining the ids is
  // O(n) on ~128 entries and only recomputes when `ordered` does.
  const shapeRevision = useMemo(() => paintOrder.join('|'), [paintOrder]);

  const counts = useMemo<Record<LayerKey, number>>(() => {
    const c: Record<LayerKey, number> = {
      circle: 0,
      polygon: 0,
      point: 0,
      multipoint: 0,
    };
    for (const n of ordered) if (n.geometry) c[n.geometry.type] += 1;
    return c;
  }, [ordered]);

  const stackNotams = useMemo(() => {
    if (!stack) return [];
    const byId = new Map(ordered.map((n) => [n.id, n]));
    return stack.ids.map((id) => byId.get(id)).filter((n): n is ParsedNotam => !!n);
  }, [stack, ordered]);

  return (
    <div className="relative size-full">
      <MapContainer
        center={[31.5, 34.9]}
        zoom={7}
        zoomControl={false}
        className="size-full"
        style={{ position: 'relative' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {KML_META.map(({ key, url, iconType }) =>
          kmlVisible[key] ? (
            <KmlLayer
              key={key}
              url={url}
              iconType={iconType}
              onCountLoaded={(count) => handleKmlCount(key, count)}
            />
          ) : null,
        )}

        {route && route.points.length === 1 && (
          <Circle
            center={[route.points[0].lat, route.points[0].lon]}
            radius={ROUTE_BUFFER_KM * 1000}
            pathOptions={{
              color: ROUTE_COLOR,
              weight: 1,
              opacity: 0.5,
              fillColor: ROUTE_COLOR,
              fillOpacity: 0.1,
              interactive: false,
            }}
          />
        )}

        {route && route.points.length >= 2 && (
          <>
            <Polygon
              positions={buildCorridorPolygon(
                route.points.map((p) => ({ lat: p.lat, lon: p.lon })),
                ROUTE_BUFFER_NM,
              )}
              pathOptions={{
                color: ROUTE_COLOR,
                weight: 1,
                opacity: 0.4,
                fillColor: ROUTE_COLOR,
                fillOpacity: 0.08,
                interactive: false,
              }}
            />
            <Polyline
              positions={route.points.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: ROUTE_COLOR,
                weight: 3,
                opacity: 0.9,
                interactive: false,
              }}
            />
            {route.points.map((p, i) => (
              <CircleMarker
                key={`route-${i}`}
                center={[p.lat, p.lon]}
                radius={4}
                pathOptions={{
                  color: ROUTE_COLOR,
                  fillColor: '#fdfbf6',
                  fillOpacity: 1,
                  weight: 2,
                  interactive: false,
                }}
              />
            ))}
          </>
        )}

        {userLocation && <UserLocationLayer fix={userLocation} />}

        <MapLayers
          ordered={ordered}
          paintOrder={paintOrder}
          registry={registry}
          visible={visible}
          shapeRevision={shapeRevision}
          selectedNotam={selectedNotam}
          selectedIds={selectedIds}
          onSelectNotam={onSelectNotam}
          onToggleSelect={onToggleSelect}
          onStack={(ids, at) => setStack({ ids, at })}
          focusPadding={focusPadding}
        />
      </MapContainer>

      {stack && stackNotams.length > 0 && (
        <StackPicker
          notams={stackNotams}
          at={stack.at}
          focusedId={selectedNotam?.id ?? null}
          onFocus={onPreviewNotam}
          onPick={(n) => {
            onSelectNotam(n);
            setStack(null);
          }}
          onDismiss={() => setStack(null)}
        />
      )}

      <SelectionToolbar selectedCount={selectedIds.size} onClear={onClearSelection} />

      <LayerPanel
        counts={counts}
        visible={visible}
        onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
        onSetAll={(value) =>
          setVisible({
            circle: value,
            polygon: value,
            point: value,
            multipoint: value,
          })
        }
        kmlVisible={kmlVisible}
        kmlCounts={kmlCounts}
        onToggleKml={(k) => setKmlVisible((v) => ({ ...v, [k]: !v[k] }))}
      />
    </div>
  );
}

/** Rough on-screen extent, used only to decide paint order. */
function area(n: ParsedNotam): number {
  const g = n.geometry;
  if (!g) return 0;
  switch (g.type) {
    case 'circle':
      // FIR-scale circles draw as a dot but must still sit at the very back:
      // they nominally cover everything, so painting them on top would bury
      // every NOTAM inside them.
      return g.radiusNm >= FIR_SCALE_RADIUS_NM
        ? Number.MAX_SAFE_INTEGER
        : g.radiusNm * g.radiusNm;
    case 'polygon':
      return bboxArea(n);
    default:
      return 0;
  }
}
