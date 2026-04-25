import { ParsedNotam } from '@/types/notam';

// Bounding-box area (lat-span × lon-span, in degrees²) of a polygon NOTAM.
// Used to sort polygons largest-first so big areas render under smaller ones.
// Returns 0 for any geometry that isn't a polygon with at least 2 vertices.
export function bboxArea(n: ParsedNotam): number {
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
