'use client';

import { useEffect, useRef } from 'react';
import { Circle, Marker, useMap } from 'react-leaflet';
import type { DivIcon } from 'leaflet';
import type { DeviceFix } from '@/hooks/useDeviceLocation';

interface UserLocationLayerProps {
  fix: DeviceFix | null;
  followOnFirstFix?: boolean;
}

const AIRCRAFT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="36" height="36">
  <path d="M32 4 L36 28 L60 40 L60 44 L36 38 L36 52 L44 57 L44 60 L32 57 L20 60 L20 57 L28 52 L28 38 L4 44 L4 40 L28 28 Z"
        fill="#1d4ed8" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

const DOT_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
  <circle cx="12" cy="12" r="7" fill="#1d4ed8" stroke="#ffffff" stroke-width="3"/>
</svg>`;

function buildIcon(heading: number | null): DivIcon | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L = require('leaflet') as typeof import('leaflet');
  const hasHeading = heading !== null && Number.isFinite(heading);
  const rotation = hasHeading ? heading : 0;
  const inner = hasHeading ? AIRCRAFT_SVG : DOT_SVG;
  const html =
    `<div class="notam-user-location" style="transform: rotate(${rotation}deg); transform-origin: 50% 50%;">` +
    inner +
    `</div>`;
  const size: [number, number] = hasHeading ? [36, 36] : [22, 22];
  return L.divIcon({
    html,
    className: 'notam-user-location-icon',
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
  });
}

export default function UserLocationLayer({
  fix,
  followOnFirstFix = true,
}: UserLocationLayerProps) {
  const map = useMap();
  const centeredRef = useRef(false);

  useEffect(() => {
    if (!fix || !followOnFirstFix || centeredRef.current) return;
    map.flyTo([fix.lat, fix.lon], Math.max(map.getZoom(), 10), { duration: 0.6 });
    centeredRef.current = true;
  }, [fix, followOnFirstFix, map]);

  const icon = buildIcon(fix?.heading ?? null);

  if (!fix || !icon) return null;

  return (
    <>
      <Circle
        center={[fix.lat, fix.lon]}
        radius={Math.max(fix.accuracy, 10)}
        pathOptions={{
          color: '#1d4ed8',
          weight: 1,
          opacity: 0.5,
          fillColor: '#3b82f6',
          fillOpacity: 0.12,
          interactive: false,
        }}
      />
      <Marker
        position={[fix.lat, fix.lon]}
        icon={icon}
        interactive={false}
        keyboard={false}
      />
    </>
  );
}
