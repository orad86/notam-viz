import type { LatLngBounds } from 'leaflet';
import { ParsedNotam, NotamGeometry } from '@/types/notam';
import { FIR_SCALE_RADIUS_NM } from '@/lib/notam-format';

export type Bbox = {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
};

function bboxFromPoints(points: Array<[number, number]>): Bbox | null {
  if (points.length === 0) return null;
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const [lat, lon] of points) {
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
  }
  return { latMin, latMax, lonMin, lonMax };
}

export function notamBbox(geometry: NotamGeometry): Bbox | null {
  if (!geometry) return null;
  if (geometry.type === 'point') {
    return {
      latMin: geometry.lat,
      latMax: geometry.lat,
      lonMin: geometry.lon,
      lonMax: geometry.lon,
    };
  }
  if (geometry.type === 'circle') {
    // FIR-scale circles render as dots; treat selection bbox as a point.
    if (geometry.radiusNm >= FIR_SCALE_RADIUS_NM) {
      return {
        latMin: geometry.lat,
        latMax: geometry.lat,
        lonMin: geometry.lon,
        lonMax: geometry.lon,
      };
    }
    const dLat = geometry.radiusNm / 60;
    const cosLat = Math.max(Math.cos((geometry.lat * Math.PI) / 180), 0.01);
    const dLon = dLat / cosLat;
    return {
      latMin: geometry.lat - dLat,
      latMax: geometry.lat + dLat,
      lonMin: geometry.lon - dLon,
      lonMax: geometry.lon + dLon,
    };
  }
  if (geometry.type === 'polygon') {
    return bboxFromPoints(geometry.vertices);
  }
  if (geometry.type === 'multipoint') {
    return bboxFromPoints(geometry.points);
  }
  return null;
}

function boundsContainsPoint(
  bounds: LatLngBounds,
  lat: number,
  lon: number,
): boolean {
  return bounds.contains([lat, lon]);
}

function boundsIntersectsBbox(bounds: LatLngBounds, b: Bbox): boolean {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  if (b.latMax < sw.lat) return false;
  if (b.latMin > ne.lat) return false;
  if (b.lonMax < sw.lng) return false;
  if (b.lonMin > ne.lng) return false;
  return true;
}

export function notamIntersectsBounds(
  notam: ParsedNotam,
  bounds: LatLngBounds,
): boolean {
  const geo = notam.geometry;
  if (!geo) return false;

  if (geo.type === 'point') {
    return boundsContainsPoint(bounds, geo.lat, geo.lon);
  }
  if (geo.type === 'circle') {
    if (geo.radiusNm >= FIR_SCALE_RADIUS_NM) {
      return boundsContainsPoint(bounds, geo.lat, geo.lon);
    }
    const bbox = notamBbox(geo);
    if (!bbox) return false;
    return boundsIntersectsBbox(bounds, bbox);
  }
  if (geo.type === 'polygon') {
    const bbox = notamBbox(geo);
    if (!bbox) return false;
    return boundsIntersectsBbox(bounds, bbox);
  }
  if (geo.type === 'multipoint') {
    for (const [lat, lon] of geo.points) {
      if (boundsContainsPoint(bounds, lat, lon)) return true;
    }
    const bbox = notamBbox(geo);
    if (!bbox) return false;
    return boundsIntersectsBbox(bounds, bbox);
  }
  return false;
}
