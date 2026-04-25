import { ParsedNotam } from '@/types/notam';
import { altitudeBandFt } from './altitude';

export const ROUTE_BUFFER_KM = 1;
// 1 NM = 1.852 km
export const ROUTE_BUFFER_NM = ROUTE_BUFFER_KM / 1.852;

export type LatLon = { lat: number; lon: number };

export type RoutePointSource = 'airport' | 'navaid' | 'vfr' | 'ifr';

export type RoutePoint = {
  code: string;
  lat: number;
  lon: number;
  source: RoutePointSource;
};

export type Route = {
  points: RoutePoint[];
  altitudeFt: number;
};

export type TimeWindow = {
  fromIso: string;
  toIso: string;
};

export type RoutePointIndex = {
  byCode: Map<string, RoutePoint>;
  all: RoutePoint[];
};

const EARTH_R_NM = 3440.065;
const NM_PER_DEG = 60;
const RAD = Math.PI / 180;

export function buildRoutePointIndex(
  sources: Array<{
    source: RoutePointSource;
    points: { name: string; lat: number; lon: number }[];
  }>,
): RoutePointIndex {
  const byCode = new Map<string, RoutePoint>();
  const all: RoutePoint[] = [];
  for (const { source, points } of sources) {
    for (const { name, lat, lon } of points) {
      const code = name.trim().toUpperCase();
      if (!code) continue;
      const rp: RoutePoint = { code, lat, lon, source };
      all.push(rp);
      if (!byCode.has(code)) byCode.set(code, rp);
    }
  }
  return { byCode, all };
}

export function resolveRouteTokens(
  tokens: string[],
  index: RoutePointIndex,
): { resolved: RoutePoint[]; unresolved: string[] } {
  const resolved: RoutePoint[] = [];
  const unresolved: string[] = [];
  for (const raw of tokens) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    const rp = index.byCode.get(code);
    if (rp) resolved.push(rp);
    else unresolved.push(code);
  }
  return { resolved, unresolved };
}

export function parseRouteInput(input: string): string[] {
  return input
    .split(/[\s,]+|->|→|-/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function haversineNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_NM * Math.asin(Math.min(1, Math.sqrt(x)));
}

function toLocal(p: LatLon, ref: LatLon): [number, number] {
  const cosRef = Math.cos(ref.lat * RAD);
  const x = (p.lon - ref.lon) * NM_PER_DEG * cosRef;
  const y = (p.lat - ref.lat) * NM_PER_DEG;
  return [x, y];
}

function fromLocal([x, y]: [number, number], ref: LatLon): LatLon {
  const cosRef = Math.cos(ref.lat * RAD);
  return {
    lat: ref.lat + y / NM_PER_DEG,
    lon: ref.lon + x / (NM_PER_DEG * cosRef),
  };
}

export function pointToSegmentDistanceNm(
  p: LatLon,
  a: LatLon,
  b: LatLon,
): number {
  const ref = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const [px, py] = toLocal(p, ref);
  const [ax, ay] = toLocal(a, ref);
  const [bx, by] = toLocal(b, ref);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

export function pointToRouteDistanceNm(p: LatLon, route: LatLon[]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) return haversineNm(p, route[0]);
  let min = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = pointToSegmentDistanceNm(p, route[i], route[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function pointInPolygon(p: LatLon, verts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [yi, xi] = verts[i];
    const [yj, xj] = verts[j];
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentIntersects(
  a: LatLon,
  b: LatLon,
  c: LatLon,
  d: LatLon,
): boolean {
  const ccw = (p1: LatLon, p2: LatLon, p3: LatLon) =>
    (p3.lat - p1.lat) * (p2.lon - p1.lon) >
    (p2.lat - p1.lat) * (p3.lon - p1.lon);
  return (
    ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
  );
}

// A NOTAM is active during [effective, expires]. The user briefs a window
// [from, to]. The NOTAM is relevant if the two intervals overlap.
export function notamOverlapsWindow(
  effective: string,
  expires: string | 'PERM',
  fromIso: string,
  toIso: string,
): boolean {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const start = Date.parse(effective);
  if (!Number.isFinite(start)) return true; // permissive on unparseable
  if (start > to) return false;
  if (expires === 'PERM') return true;
  const end = Date.parse(expires);
  if (!Number.isFinite(end)) return true;
  return end >= from;
}

function isAltitudeInBand(
  lower: string | undefined,
  upper: string | undefined,
  altFt: number,
): boolean {
  const { lower: lo, upper: hi } = altitudeBandFt(lower, upper);
  return altFt >= lo && altFt <= hi;
}

function geometryWithinBuffer(
  notam: ParsedNotam,
  route: LatLon[],
  bufferNm: number,
): boolean {
  const g = notam.geometry;
  if (!g) return false;

  if (g.type === 'point') {
    return pointToRouteDistanceNm({ lat: g.lat, lon: g.lon }, route) <= bufferNm;
  }

  if (g.type === 'circle') {
    return (
      pointToRouteDistanceNm({ lat: g.lat, lon: g.lon }, route) <=
      bufferNm + g.radiusNm
    );
  }

  if (g.type === 'multipoint') {
    for (const [lat, lon] of g.points) {
      if (pointToRouteDistanceNm({ lat, lon }, route) <= bufferNm) return true;
    }
    return false;
  }

  if (g.type === 'polygon') {
    const verts = g.vertices;
    for (const [lat, lon] of verts) {
      if (pointToRouteDistanceNm({ lat, lon }, route) <= bufferNm) return true;
    }
    for (const pt of route) {
      if (pointInPolygon(pt, verts)) return true;
    }
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      for (let j = 0; j < verts.length; j++) {
        const [lat1, lon1] = verts[j];
        const [lat2, lon2] = verts[(j + 1) % verts.length];
        if (
          segmentIntersects(
            a,
            b,
            { lat: lat1, lon: lon1 },
            { lat: lat2, lon: lon2 },
          )
        )
          return true;
      }
    }
    return false;
  }

  return false;
}

export function notamMatchesRoute(
  notam: ParsedNotam,
  route: Route,
  bufferNm: number = ROUTE_BUFFER_NM,
): boolean {
  if (route.points.length < 1) return true;
  if (!isAltitudeInBand(notam.lowerLimit, notam.upperLimit, route.altitudeFt))
    return false;
  const latlons: LatLon[] = route.points.map((p) => ({ lat: p.lat, lon: p.lon }));
  return geometryWithinBuffer(notam, latlons, bufferNm);
}

export function buildCorridorPolygon(
  points: LatLon[],
  bufferNm: number = ROUTE_BUFFER_NM,
): Array<[number, number]> {
  if (points.length < 2) return [];
  const refLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const refLon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const ref = { lat: refLat, lon: refLon };
  const local = points.map((p) => toLocal(p, ref));

  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < local.length; i++) {
    let nx = 0,
      ny = 0;
    if (i > 0) {
      const dx = local[i][0] - local[i - 1][0];
      const dy = local[i][1] - local[i - 1][1];
      const len = Math.hypot(dx, dy) || 1;
      nx += -dy / len;
      ny += dx / len;
    }
    if (i < local.length - 1) {
      const dx = local[i + 1][0] - local[i][0];
      const dy = local[i + 1][1] - local[i][1];
      const len = Math.hypot(dx, dy) || 1;
      nx += -dy / len;
      ny += dx / len;
    }
    const nlen = Math.hypot(nx, ny) || 1;
    nx /= nlen;
    ny /= nlen;
    left.push([local[i][0] + nx * bufferNm, local[i][1] + ny * bufferNm]);
    right.push([local[i][0] - nx * bufferNm, local[i][1] - ny * bufferNm]);
  }

  const ring: LatLon[] = [
    ...left.map((p) => fromLocal(p, ref)),
    ...right.reverse().map((p) => fromLocal(p, ref)),
  ];

  return ring.map((p) => [p.lat, p.lon]);
}
