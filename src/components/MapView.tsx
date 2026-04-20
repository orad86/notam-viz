'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  CircleMarker,
  Polygon,
  Popup,
  useMap,
} from 'react-leaflet';
import { ParsedNotam } from '@/types/notam';
import 'leaflet/dist/leaflet.css';

type LayerKey = 'circle' | 'polygon' | 'point' | 'multipoint';

// Circles ≥ this radius (NM) collapse to a center-dot: they're typically
// FIR-wide NOTAMs whose giant outline would hide the basemap without
// conveying real spatial information.
const FIR_SCALE_RADIUS_NM = 150;

function formatPopupDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const MM = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${HH}${MM}Z`;
  } catch {
    return iso;
  }
}

function trimTrailingParen(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/\)\s*$/, '').trim();
}

// Prefer the human-readable F/G lines from the body when present; otherwise
// fall back to the Q-line limits (which are flight-levels like "000"/"010").
function formatAltitudeRange(n: ParsedNotam): string | null {
  const f = trimTrailingParen(n.fLine);
  const g = trimTrailingParen(n.gLine);
  if (f && g) return `${f} → ${g}`;
  if (f || g) return f || g;
  const lo = n.lowerLimit?.trim();
  const hi = n.upperLimit?.trim();
  if (lo && hi) return `FL${lo} → FL${hi}`;
  if (lo || hi) return lo || hi || null;
  return null;
}

function formatScope(scope?: string): string | null {
  const s = (scope || '').trim().toUpperCase();
  if (!s) return null;
  if (s.includes('A') && s.includes('E')) return 'Aerodrome + En-route';
  if (s === 'A') return 'Aerodrome';
  if (s === 'E') return 'En-route';
  if (s === 'W') return 'Warning';
  return s;
}

function formatTraffic(sig?: string): string | null {
  const s = (sig || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'IV') return 'IFR/VFR';
  if (s === 'I') return 'IFR';
  if (s === 'V') return 'VFR';
  return s;
}

interface NotamPopupProps {
  notam: ParsedNotam;
  extra?: ReactNode;
}

function NotamPopup({ notam, extra }: NotamPopupProps) {
  const altitude = formatAltitudeRange(notam);
  const scope = formatScope(notam.scope);
  const traffic = formatTraffic(notam.significance);
  const expires =
    notam.expires === 'PERM' ? 'PERM' : formatPopupDate(notam.expires);
  const eText = (notam.eItem || '').replace(/^E\)\s*/, '').trim();
  const preview = eText.length > 220 ? eText.slice(0, 220).trimEnd() + '…' : eText;

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

      {preview && (
        <div className="text-gray-800 whitespace-pre-line">{preview}</div>
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

function getCategoryColor(category: string): string {
  switch (category) {
    case 'airspace':
      return '#3b82f6'; // blue
    case 'obstacle':
      return '#ef4444'; // red
    case 'navaid':
      return '#a855f7'; // purple
    case 'runway':
      return '#f59e0b'; // amber
    case 'airport':
      return '#22c55e'; // green
    case 'procedure':
      return '#06b6d4'; // cyan
    case 'military':
      return '#8b5cf6'; // violet
    default:
      return '#6b7280'; // gray
  }
}

function MapController({ selectedNotam }: { selectedNotam: ParsedNotam | null }) {
  const map = useMap();

  useEffect(() => {
    if (selectedNotam && selectedNotam.geometry) {
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
    }
  }, [selectedNotam, map]);

  return null;
}

// Import L only when needed
let L: any = null;

interface MapViewProps {
  notams: ParsedNotam[];
  onSelectNotam: (notam: ParsedNotam) => void;
  selectedNotam: ParsedNotam | null;
}

interface LayerPanelProps {
  counts: Record<LayerKey, number>;
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  onSetAll: (value: boolean) => void;
}

function LayerPanel({ counts, visible, onToggle, onSetAll }: LayerPanelProps) {
  return (
    <div
      className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-md text-xs"
      // Stop map drag/scroll/click from firing when interacting with the panel.
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="font-semibold text-gray-700">Layers</span>
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
    </div>
  );
}

export default function MapView({
  notams,
  onSelectNotam,
  selectedNotam,
}: MapViewProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    circle: true,
    polygon: true,
    point: true,
    multipoint: true,
  });

  useEffect(() => {
    // Lazy load leaflet only on client
    if (typeof window !== 'undefined') {
      L = require('leaflet');

      // Fix icon URLs
      if (L?.Icon?.Default) {
        const DefaultIcon = L.Icon.Default;
        DefaultIcon.prototype.options.iconUrl = '/leaflet/marker-icon.png';
        DefaultIcon.prototype.options.iconRetinaUrl = '/leaflet/marker-icon-2x.png';
        DefaultIcon.prototype.options.shadowUrl = '/leaflet/marker-shadow.png';
      }
    }
    setMounted(true);
  }, []);

  // Group by geometry type so we can render in a fixed z-order and count.
  // Within each type, sort so *smaller* shapes render last (Leaflet paints in
  // render order, so last-rendered = top of stack = catches clicks first).
  // Big circles that fully contain small ones otherwise steal every click
  // inside them — even when their fill is transparent, the SVG path still
  // intercepts pointer events.
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

    // Sort circles: huge FIR-scale ones first (they render as small dots but
    // should sit at the bottom conceptually), then by descending radius so the
    // smallest normal circle ends up on top.
    g.circle.sort((a, b) => {
      if (a.geometry?.type !== 'circle' || b.geometry?.type !== 'circle') return 0;
      const ra = a.geometry.radiusNm;
      const rb = b.geometry.radiusNm;
      // Clamp FIR-scale to 0 so it sinks to the bottom of the sort, then
      // bubbles back to the top via the descending sort — i.e. largest real
      // circle first, smallest last, FIR-scale dots painted on top of them.
      const sa = ra >= FIR_SCALE_RADIUS_NM ? -1 : ra;
      const sb = rb >= FIR_SCALE_RADIUS_NM ? -1 : rb;
      return sb - sa;
    });

    // Polygons: sort by bounding-box area (desc) so smaller ones sit on top.
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

  const renderCircle = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'circle') return null;
    const color = getCategoryColor(notam.category);
    const isSelected = selectedNotam?.id === notam.id;
    const weight = isSelected ? 2.5 : 1;
    const { lat, lon, radiusNm } = notam.geometry;
    const popup = (
      <Popup>
        <NotamPopup
          notam={notam}
          extra={
            <>
              <span className="text-gray-500">Radius:</span>{' '}
              <span className="font-mono text-gray-900">{radiusNm} NM</span>
            </>
          }
        />
      </Popup>
    );

    if (radiusNm >= FIR_SCALE_RADIUS_NM) {
      // FIR-scale: show as a small marker so it doesn't paint over everything.
      return (
        <CircleMarker
          key={`c-${notam.id}`}
          center={[lat, lon]}
          radius={isSelected ? 7 : 5}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: isSelected ? 0.9 : 0.6,
            weight: isSelected ? 2 : 1,
          }}
          eventHandlers={{ click: () => onSelectNotam(notam) }}
        >
          {popup}
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
          color,
          fillColor: color,
          // Stroke-only by default so stacked circles don't hide each other
          // or the basemap; selection fills in for emphasis.
          fillOpacity: isSelected ? 0.25 : 0,
          opacity: isSelected ? 0.95 : 0.7,
          weight,
        }}
        eventHandlers={{ click: () => onSelectNotam(notam) }}
      >
        {popup}
      </Circle>
    );
  };

  const renderPolygon = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'polygon') return null;
    const color = getCategoryColor(notam.category);
    const isSelected = selectedNotam?.id === notam.id;
    const weight = isSelected ? 3 : 2;
    return (
      <Polygon
        key={`pg-${notam.id}`}
        positions={notam.geometry.vertices}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: isSelected ? 0.35 : 0.15,
          weight,
        }}
        eventHandlers={{ click: () => onSelectNotam(notam) }}
      >
        <Popup>
          <NotamPopup
            notam={notam}
            extra={
              <>
                <span className="text-gray-500">Vertices:</span>{' '}
                <span className="font-mono text-gray-900">
                  {notam.geometry.vertices.length}
                </span>
              </>
            }
          />
        </Popup>
      </Polygon>
    );
  };

  const renderMultipoint = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'multipoint') return null;
    const { points } = notam.geometry;
    const color = getCategoryColor(notam.category);
    const isSelected = selectedNotam?.id === notam.id;
    const weight = isSelected ? 3 : 2;
    return (
      <Fragment key={`mp-${notam.id}`}>
        {points.map((pt, idx) => (
          <CircleMarker
            key={`${notam.id}-${idx}`}
            center={pt}
            radius={5}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight,
            }}
            eventHandlers={{ click: () => onSelectNotam(notam) }}
          >
            <Popup>
              <NotamPopup
                notam={notam}
                extra={
                  <>
                    <span className="text-gray-500">Point:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {idx + 1} of {points.length}
                    </span>
                  </>
                }
              />
            </Popup>
          </CircleMarker>
        ))}
      </Fragment>
    );
  };

  const renderPoint = (notam: ParsedNotam) => {
    if (notam.geometry?.type !== 'point') return null;
    return (
      <Marker
        key={`p-${notam.id}`}
        position={[notam.geometry.lat, notam.geometry.lon]}
        eventHandlers={{ click: () => onSelectNotam(notam) }}
      >
        <Popup>
          <NotamPopup notam={notam} />
        </Popup>
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

        <MapController selectedNotam={selectedNotam} />

        {/* Render order (bottom → top): circles → polygons → multipoints → points.
            Leaflet paints later children above earlier ones, so smaller shapes
            aren't hidden under the big FIR-radius circles. */}
        {visible.circle && grouped.circle.map(renderCircle)}
        {visible.polygon && grouped.polygon.map(renderPolygon)}
        {visible.multipoint && grouped.multipoint.map(renderMultipoint)}
        {visible.point && grouped.point.map(renderPoint)}
      </MapContainer>

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
      />
    </div>
  );
}
