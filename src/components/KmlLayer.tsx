'use client';

import { useEffect, useState } from 'react';
import { LayerGroup, Marker, Tooltip } from 'react-leaflet';
import { loadKmlPoints, KmlPoint } from '@/lib/kml-layer';
import { getAviationIcon, IconType } from '@/lib/aviation-icons';

type Props = {
  url: string;
  iconType: IconType;
  onCountLoaded?: (count: number) => void;
};

export default function KmlLayer({ url, iconType, onCountLoaded }: Props) {
  const [points, setPoints] = useState<KmlPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadKmlPoints(url).then((p) => {
      if (cancelled) return;
      setPoints(p);
      onCountLoaded?.(p.length);
    });
    return () => {
      cancelled = true;
    };
  }, [url, onCountLoaded]);

  const icon = getAviationIcon(iconType);

  return (
    <LayerGroup>
      {points.map((p, i) => (
        <Marker
          key={`${p.name}-${i}`}
          position={[p.lat, p.lon]}
          icon={icon}
          interactive={false}
          keyboard={false}
        >
          <Tooltip
            direction="bottom"
            offset={[0, 6]}
            permanent
            opacity={1}
            className="aviation-label"
          >
            {p.name}
          </Tooltip>
        </Marker>
      ))}
    </LayerGroup>
  );
}
