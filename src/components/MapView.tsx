'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  CircleMarker,
  Polygon,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { LeafletMouseEvent, Layer as LeafletLayer } from 'leaflet';
import { ParsedNotam } from '@/types/notam';
import {
  formatUtcDate as formatPopupDate,
  formatAltitudeRange,
  formatScope,
  formatTraffic,
  getCategoryColor,
  FIR_SCALE_RADIUS_NM,
} from '@/lib/notam-format';
import KmlLayer from './KmlLayer';
import SelectionToolbar from './SelectionToolbar';
import {
  Route,
  buildCorridorPolygon,
  ROUTE_BUFFER_NM,
  ROUTE_BUFFER_KM,
} from '@/lib/route-filter';
import { getAviationIconSvg, type IconType } from '@/lib/aviation-icons';
import 'leaflet/dist/leaflet.css';

type LayerKey = 'circle' | 'polygon' | 'point' | 'multipoint';
type KmlKey = 'vfr' | 'ifr' | 'navaids' | 'airports';

interface NotamPopupProps {
  notam: ParsedNotam;
  isMember: boolean;
  onToggleSelect: (id: string) => void;
  extra?: ReactNode;
}

function NotamPopup({ notam, isMember, onToggleSelect, extra }: NotamPopupProps) {
  const altitude = formatAltitudeRange(notam);
  const scope = formatScope(notam.scope);
  const traffic = formatTraffic(notam.significance);
  const expires =
    notam.expires === 'PERM' ? 'PERM' : formatPopupDate(notam.expires);
  const eText = (notam.eItem || '').replace(/^E\)\s*/, '').trim();

  return (
    <div className="min-w-[240px] max-w-[320px] space-y-1.5 text-[12px] leading-snug">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-sm">{notam.notamId}</span>
        <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-700 rounded capitalize">
          {notam.category}
        </span>
        {notam.isActive ? (
          <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-800 rounded">
            active
          </span>
        ) : (
          <span className="px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-600 rounded">
            inactive
          </span>
        )}
      </div>

      <label
        className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer select-none text-[11px] ${
          isMember
            ? 'bg-blue-50 text-blue-800 border border-blue-200'
            : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
        }`}
      >
        <input
          type="checkbox"
          checked={isMember}
          onChange={() => onToggleSelect(notam.id)}
          className="accent-blue-600"
        />
        <span className="font-semibold">
          {isMember ? 'In selection (tap to remove)' : 'Add to selection'}
        </span>
      </label>

      {eText && (
        <div className="text-gray-800 whitespace-pre-line max-h-60 overflow-auto border border-gray-100 rounded p-1.5 bg-gray-50/50">
          {eText}
        </div>
      )}

      <div className="pt-1 border-t border-gray-200 space-y-0.5 text-[11px]">
        <div>
          <span className="text-gray-500">Valid:</span>{' '}
          <span className="font-mono text-gray-900">
            {formatPopupDate(notam.effective)}
          </span>
          <span className="mx-1 text-gray-400">→</span>
          <span
            className={`font-mono ${expires === 'PERM' ? 'text-red-600 font-semibold' : 'text-gray-900'}`}
          >
            {expires}
          </span>
        </div>

        {altitude && (
          <div>
            <span className="text-gray-500">Altitude:</span>{' '}
            <span className="font-mono text-gray-900">{altitude}</span>
          </div>
        )}

        {(scope || traffic) && (
          <div>
            {scope && (
              <>
                <span className="text-gray-500">Scope:</span>{' '}
                <span className="text-gray-900">{scope}</span>
              </>
            )}
            {scope && traffic && <span className="mx-1 text-gray-300">·</span>}
            {traffic && (
              <>
                <span className="text-gray-500">Traffic:</span>{' '}
                <span className="text-gray-900">{traffic}</span>
              </>
            )}
          </div>
        )}

        {notam.dLine && (
          <div>
            <span className="text-gray-500">Schedule:</span>{' '}
            <span className="text-gray-900">{notam.dLine}</span>
          </div>
        )}

        <div>
          <span className="text-gray-500">Q-code:</span>{' '}
          <span className="font-mono text-gray-900">{notam.qCode}</span>
          {notam.qCodeExplanation && (
            <span className="text-gray-500 italic"> — {notam.qCodeExplanation}</span>
          )}
        </div>

        {notam.location && (
          <div>
            <span className="text-gray-500">Location:</span>{' '}
            <span className="font-mono text-gray-900">{notam.location}</span>
          </div>
        )}

        {extra && <div>{extra}</div>}
      </div>
    </div>
  );
}

function bboxArea(n: ParsedNotam): number {
  if (n.geometry?.type !== 'polygon') return 0;
  const verts = n.geometry.vertices;
  if (verts.length < 2) return 0;
  let latMin = Infinity,
    latMax = -Infinity,
    lonMin = Infinity,
    lonMax = -Infinity;
  for (const [lat, lon] of verts) {
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
  }
  return (latMax - latMin) * (lonMax - lonMin);
}

const LAYER_META: Array<{
  key: LayerKey;
  label: string;
  swatch: string;
}> = [
  { key: 'circle', label: 'Circles', swatch: '#3b82f6' },
  { key: 'polygon', label: 'Polygons', swatch: '#22c55e' },
  { key: 'point', label: 'Points', swatch: '#6b7280' },
  { key: 'multipoint', label: 'Multipoints', swatch: '#ef4444' },
];

const KML_META: Array<{
  key: KmlKey;
  label: string;
  url: string;
  color: string;
  iconType: IconType;
}> = [
  { key: 'airports', label: 'Airports', url: '/kml/airports.kml', color: '#dc2626', iconType: 'airport' },
  { key: 'navaids', label: 'Navaids', url: '/kml/navaids.kml', color: '#10b981', iconType: 'vor' },
  { key: 'vfr', label: 'VFR waypoints', url: '/kml/vfr_waypoints.kml', color: '#8b5cf6', iconType: 'vfr' },
  { key: 'ifr', label: 'IFR waypoints', url: '/kml/ifr_waypoints.kml', color: '#f97316', iconType: 'ifr' },
];

function MapController({
  selectedNotam,
  popupRefs,
}: {
  selectedNotam: ParsedNotam | null;
  popupRefs: React.MutableRefObject<Map<string, LeafletLayer>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedNotam || !selectedNotam.geometry) return;
    const geo = selectedNotam.geometry;
    if (geo.type === 'point' || geo.type === 'circle') {
      map.flyTo([geo.lat, geo.lon], 9, { duration: 0.5 });
    } else if (geo.type === 'polygon') {
      const bounds = L.latLngBounds(geo.vertices);
      map.fitBounds(bounds, { padding: [50, 50], duration: 0.5 });
    } else if (geo.type === 'multipoint') {
      const bounds = L.latLngBounds(geo.points);
      map.fitBounds(bounds, { padding: [50, 50], duration: 0.5 });
    }
    // Open the matching popup once the pan/zoom starts. Slight delay lets
    // Leaflet finish repositioning so the popup anchors correctly.
    const id = setTimeout(() => {
      const layer = popupRefs.current.get(selectedNotam.id);
      layer?.openPopup?.();
    }, 250);
    return () => clearTimeout(id);
  }, [selectedNotam, map, popupRefs]);

  return null;
}

function MapBackgroundClick({ onClick }: { onClick: () => void }) {
  useMapEvents({
    click: () => onClick(),
  });
  return null;
}

let L: any = null;

interface MapViewProps {
  notams: ParsedNotam[];
  onSelectNotam: (notam: ParsedNotam | null) => void;
  selectedNotam: ParsedNotam | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  route: Route | null;
}

function isToggleClick(e: LeafletMouseEvent): boolean {
  const oe = e.originalEvent;
  return !!oe.shiftKey || !!oe.metaKey || !!oe.ctrlKey;
}

interface LayerPanelProps {
  counts: Record<LayerKey, number>;
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  onSetAll: (value: boolean) => void;
  kmlVisible: Record<KmlKey, boolean>;
  kmlCounts: Record<KmlKey, number>;
  onToggleKml: (key: KmlKey) => void;
}

function LayerPanel({
  counts,
  visible,
  onToggle,
  onSetAll,
  kmlVisible,
  kmlCounts,
  onToggleKml,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-md text-xs max-w-[220px]"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-gray-100 hover:bg-gray-50 rounded-t-lg"
      >
        <span className="font-semibold text-gray-700">Layers</span>
        <span className="text-gray-400 text-[10px]">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <>
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              NOTAMs
            </span>
            <div className="flex gap-2 text-[10px]">
              <button
                className="text-blue-600 hover:underline"
                onClick={() => onSetAll(true)}
              >
                all
              </button>
              <button
                className="text-gray-500 hover:underline"
                onClick={() => onSetAll(false)}
              >
                none
              </button>
            </div>
          </div>
          <div className="p-2 space-y-1">
            {LAYER_META.map(({ key, label, swatch }) => (
              <label
                key={key}
                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={visible[key]}
                  onChange={() => onToggle(key)}
                />
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                  style={{ backgroundColor: swatch, opacity: 0.5 }}
                />
                <span className="text-gray-700">{label}</span>
                <span className="ml-auto text-gray-400 tabular-nums">
                  {counts[key]}
                </span>
              </label>
            ))}
          </div>

          <div className="px-3 py-1.5 border-t border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Reference
            </span>
          </div>
          <div className="p-2 space-y-1">
            {KML_META.map(({ key, label, iconType }) => (
              <label
                key={key}
                className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={kmlVisible[key]}
                  onChange={() => onToggleKml(key)}
                />
                <span
                  className="inline-flex items-center justify-center w-5 h-5 shrink-0"
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: getAviationIconSvg(iconType) }}
                />
                <span className="text-gray-700">{label}</span>
                <span className="ml-auto text-gray-400 tabular-nums">
                  {kmlCounts[key] || ''}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MapView({
  notams,
  onSelectNotam,
  selectedNotam,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  route,
}: MapViewProps) {
  const [mounted, setMounted] = useState(false);
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

  const popupRefs = useRef<Map<string, LeafletLayer>>(new Map());

  const handleShapeClick = (notam: ParsedNotam, e: LeafletMouseEvent) => {
    if (isToggleClick(e)) {
      onToggleSelect(notam.id);
    } else {
      onSelectNotam(notam);
    }
  };

  const registerRef = useCallback(
    (id: string, layer: LeafletLayer | null) => {
      if (layer) popupRefs.current.set(id, layer);
      else popupRefs.current.delete(id);
    },
    [],
  );

  const handleKmlCount = useCallback(
    (key: KmlKey, count: number) => {
      setKmlCounts((prev) =>
        prev[key] === count ? prev : { ...prev, [key]: count },
      );
    },
    [],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      L = require('leaflet');
      if (L?.Icon?.Default) {
        const DefaultIcon = L.Icon.Default;
        DefaultIcon.prototype.options.iconUrl = '/leaflet/marker-icon.png';
        DefaultIcon.prototype.options.iconRetinaUrl = '/leaflet/marker-icon-2x.png';
        DefaultIcon.prototype.options.shadowUrl = '/leaflet/marker-shadow.png';
      }
    }
    setMounted(true);
  }, []);

  const grouped = useMemo(() => {
    const g: Record<LayerKey, ParsedNotam[]> = {
      circle: [],
      polygon: [],
      point: [],
      multipoint: [],
    };
    for (const n of notams) {
      if (!n.geometry) continue;
      g[n.geometry.type].push(n);
    }

    g.circle.sort((a, b) => {
      if (a.geometry?.type !== 'circle' || b.geometry?.type !== 'circle') return 0;
      const ra = a.geometry.radiusNm;
      const rb = b.geometry.radiusNm;
      const sa = ra >= FIR_SCALE_RADIUS_NM ? -1 : ra;
      const sb = rb >= FIR_SCALE_RADIUS_NM ? -1 : rb;
      return sb - sa;
    });

    g.polygon.sort((a, b) => bboxArea(b) - bboxArea(a));

    return g;
  }, [notams]);

  const counts = useMemo<Record<LayerKey, number>>(
    () => ({
      circle: grouped.circle.length,
      polygon: grouped.polygon.length,
      point: grouped.point.length,
      multipoint: grouped.multipoint.length,
    }),
    [grouped],
  );

  if (!mounted) {
    return <div className="flex-1 bg-gray-100 animate-pulse" />;
  }

  const renderPopupInner = (notam: ParsedNotam, extra?: ReactNode) => (
    <Popup>
      <NotamPopup
        notam={notam}
        isMember={selectedIds.has(notam.id)}
        onToggleSelect={onToggleSelect}
        extra={extra}
      />
    </Popup>
  );

  const renderCircle = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'circle') return null;
    const color = getCategoryColor(notam.category);
    const isFocused = selectedNotam?.id === notam.id;
    const isMember = selectedIds.has(notam.id);
    const weight = isMember ? 3 : isFocused ? 2.5 : 1;
    const { lat, lon, radiusNm } = notam.geometry;

    if (radiusNm >= FIR_SCALE_RADIUS_NM) {
      return (
        <CircleMarker
          key={`c-${notam.id}`}
          center={[lat, lon]}
          radius={isMember ? 8 : isFocused ? 7 : 5}
          pathOptions={{
            color: isMember ? '#1d4ed8' : color,
            fillColor: color,
            fillOpacity: isMember ? 1 : isFocused ? 0.9 : 0.6,
            weight,
          }}
          eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
          ref={(instance) => registerRef(notam.id, instance as unknown as LeafletLayer | null)}
        >
          {renderPopupInner(notam, (
            <>
              <span className="text-gray-500">Radius:</span>{' '}
              <span className="font-mono text-gray-900">{radiusNm} NM</span>
            </>
          ))}
        </CircleMarker>
      );
    }

    const radiusM = Math.min(radiusNm, 200) * 1852;
    return (
      <Circle
        key={`c-${notam.id}`}
        center={[lat, lon]}
        radius={radiusM}
        pathOptions={{
          color: isMember ? '#1d4ed8' : color,
          fillColor: color,
          fillOpacity: isMember ? 0.3 : isFocused ? 0.25 : 0,
          opacity: isMember ? 1 : isFocused ? 0.95 : 0.7,
          weight,
          dashArray: isMember ? '6 4' : undefined,
        }}
        eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
        ref={(instance) => registerRef(notam.id, instance as unknown as LeafletLayer | null)}
      >
        {renderPopupInner(notam, (
          <>
            <span className="text-gray-500">Radius:</span>{' '}
            <span className="font-mono text-gray-900">{radiusNm} NM</span>
          </>
        ))}
      </Circle>
    );
  };

  const renderPolygon = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'polygon') return null;
    const color = getCategoryColor(notam.category);
    const isFocused = selectedNotam?.id === notam.id;
    const isMember = selectedIds.has(notam.id);
    const weight = isMember ? 4 : isFocused ? 3 : 2;
    const vertexCount = notam.geometry.vertices.length;
    return (
      <Polygon
        key={`pg-${notam.id}`}
        positions={notam.geometry.vertices}
        pathOptions={{
          color: isMember ? '#1d4ed8' : color,
          fillColor: color,
          fillOpacity: isMember ? 0.4 : isFocused ? 0.35 : 0.15,
          weight,
          dashArray: isMember ? '6 4' : undefined,
        }}
        eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
        ref={(instance) => registerRef(notam.id, instance as unknown as LeafletLayer | null)}
      >
        {renderPopupInner(notam, (
          <>
            <span className="text-gray-500">Vertices:</span>{' '}
            <span className="font-mono text-gray-900">{vertexCount}</span>
          </>
        ))}
      </Polygon>
    );
  };

  const renderMultipoint = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'multipoint') return null;
    const { points } = notam.geometry;
    const color = getCategoryColor(notam.category);
    const isFocused = selectedNotam?.id === notam.id;
    const isMember = selectedIds.has(notam.id);
    const weight = isMember ? 4 : isFocused ? 3 : 2;
    return (
      <Fragment key={`mp-${notam.id}`}>
        {points.map((pt, idx) => (
          <CircleMarker
            key={`${notam.id}-${idx}`}
            center={pt}
            radius={isMember ? 7 : 5}
            pathOptions={{
              color: isMember ? '#1d4ed8' : color,
              fillColor: color,
              fillOpacity: isMember ? 1 : 0.7,
              weight,
            }}
            eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
            ref={
              idx === 0
                ? (instance) =>
                    registerRef(notam.id, instance as unknown as LeafletLayer | null)
                : undefined
            }
          >
            {renderPopupInner(notam, (
              <>
                <span className="text-gray-500">Point:</span>{' '}
                <span className="font-mono text-gray-900">
                  {idx + 1} of {points.length}
                </span>
              </>
            ))}
          </CircleMarker>
        ))}
      </Fragment>
    );
  };

  const renderPoint = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'point') return null;
    const isMember = selectedIds.has(notam.id);
    const { lat, lon } = notam.geometry;
    if (isMember) {
      return (
        <Fragment key={`p-${notam.id}`}>
          <CircleMarker
            center={[lat, lon]}
            radius={14}
            pathOptions={{
              color: '#1d4ed8',
              weight: 2.5,
              fill: false,
              dashArray: '4 3',
            }}
            eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
          />
          <Marker
            position={[lat, lon]}
            eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
            ref={(instance) => registerRef(notam.id, instance as unknown as LeafletLayer | null)}
          >
            {renderPopupInner(notam)}
          </Marker>
        </Fragment>
      );
    }
    return (
      <Marker
        key={`p-${notam.id}`}
        position={[lat, lon]}
        eventHandlers={{ click: (e) => handleShapeClick(notam, e) }}
        ref={(instance) => registerRef(notam.id, instance as unknown as LeafletLayer | null)}
      >
        {renderPopupInner(notam)}
      </Marker>
    );
  };

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[31.5, 34.9]}
        zoom={7}
        className="w-full h-full"
        style={{ position: 'relative' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapController selectedNotam={selectedNotam} popupRefs={popupRefs} />
        <MapBackgroundClick onClick={() => onSelectNotam(null)} />

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
          <>
            <Circle
              center={[route.points[0].lat, route.points[0].lon]}
              radius={ROUTE_BUFFER_KM * 1000}
              pathOptions={{
                color: '#2563eb',
                weight: 1,
                opacity: 0.5,
                fillColor: '#2563eb',
                fillOpacity: 0.12,
                interactive: false,
              }}
            />
            <CircleMarker
              center={[route.points[0].lat, route.points[0].lon]}
              radius={4}
              pathOptions={{
                color: '#1d4ed8',
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2,
              }}
              interactive={false}
            />
          </>
        )}

        {route && route.points.length >= 2 && (
          <>
            <Polygon
              positions={buildCorridorPolygon(
                route.points.map((p) => ({ lat: p.lat, lon: p.lon })),
                ROUTE_BUFFER_NM,
              )}
              pathOptions={{
                color: '#2563eb',
                weight: 1,
                opacity: 0.4,
                fillColor: '#2563eb',
                fillOpacity: 0.1,
                interactive: false,
              }}
            />
            <Polyline
              positions={route.points.map((p) => [p.lat, p.lon])}
              pathOptions={{
                color: '#1d4ed8',
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
                  color: '#1d4ed8',
                  fillColor: '#ffffff',
                  fillOpacity: 1,
                  weight: 2,
                }}
                interactive={false}
              />
            ))}
          </>
        )}

        {visible.circle && grouped.circle.map(renderCircle)}
        {visible.polygon && grouped.polygon.map(renderPolygon)}
        {visible.multipoint && grouped.multipoint.map(renderMultipoint)}
        {visible.point && grouped.point.map(renderPoint)}
      </MapContainer>

      <SelectionToolbar
        selectedCount={selectedIds.size}
        onClear={onClearSelection}
      />

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
