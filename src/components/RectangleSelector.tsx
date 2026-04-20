'use client';

import { useEffect, useState } from 'react';
import { Rectangle, useMap } from 'react-leaflet';
import type { LatLngBounds, LeafletMouseEvent } from 'leaflet';

interface Props {
  active: boolean;
  onRectSelect: (bounds: LatLngBounds) => void;
}

export default function RectangleSelector({ active, onRectSelect }: Props) {
  const map = useMap();
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [current, setCurrent] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!active) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.disable();
      const el = map.getContainer();
      el.style.cursor = '';
      return;
    }

    map.dragging.disable();
    map.doubleClickZoom.disable();
    map.boxZoom.disable();
    const el = map.getContainer();
    el.style.cursor = 'crosshair';
    map.closePopup();

    const onMouseDown = (e: LeafletMouseEvent) => {
      setStart({ lat: e.latlng.lat, lng: e.latlng.lng });
      setCurrent({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    const onMouseMove = (e: LeafletMouseEvent) => {
      setStart((s) => {
        if (!s) return s;
        setCurrent({ lat: e.latlng.lat, lng: e.latlng.lng });
        return s;
      });
    };
    const onMouseUp = (e: LeafletMouseEvent) => {
      setStart((s) => {
        if (s) {
          const L = require('leaflet');
          const bounds: LatLngBounds = L.latLngBounds(
            [s.lat, s.lng],
            [e.latlng.lat, e.latlng.lng],
          );
          // Only fire if the drag covered a meaningful area (avoids stray clicks).
          const pxStart = map.latLngToContainerPoint([s.lat, s.lng]);
          const pxEnd = map.latLngToContainerPoint([e.latlng.lat, e.latlng.lng]);
          const dx = Math.abs(pxEnd.x - pxStart.x);
          const dy = Math.abs(pxEnd.y - pxStart.y);
          if (dx > 4 || dy > 4) onRectSelect(bounds);
        }
        return null;
      });
      setCurrent(null);
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      el.style.cursor = '';
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [active, map, onRectSelect]);

  if (!active || !start || !current) return null;

  const L = typeof window !== 'undefined' ? require('leaflet') : null;
  if (!L) return null;
  const bounds: LatLngBounds = L.latLngBounds(
    [start.lat, start.lng],
    [current.lat, current.lng],
  );

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: '#2563eb',
        weight: 1.5,
        dashArray: '4 4',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
      }}
    />
  );
}
