import { NotamGeometry } from '@/types/notam';

// Israeli airspace bounds
const VALID_LAT_MIN = 27;
const VALID_LAT_MAX = 36;
const VALID_LON_MIN = 32;
const VALID_LON_MAX = 38;

function isValidIsraeliCoord(lat: number, lon: number): boolean {
  return (
    lat >= VALID_LAT_MIN &&
    lat <= VALID_LAT_MAX &&
    lon >= VALID_LON_MIN &&
    lon <= VALID_LON_MAX
  );
}

export function dmsToDec(
  deg: number,
  min: number,
  sec: number,
  dir: string
): number {
  let decimal = deg + min / 60 + sec / 3600;
  if (dir === 'S' || dir === 'W') {
    decimal = -decimal;
  }
  return decimal;
}

export function dmToDecimal(deg: number, min: number, dir: string): number {
  let decimal = deg + min / 60;
  if (dir === 'S' || dir === 'W') {
    decimal = -decimal;
  }
  return decimal;
}

export function parseCoordinatePair(
  coordStr: string
): [number, number] | null {
  // Try DMS format: DDMMSSN/DDDMMSSE or DDMMSS.SSN/DDDMMSS.SSE
  const dmsMatch = coordStr.match(
    /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\D*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])/
  );
  if (dmsMatch) {
    const [, latDeg, latMin, latSec, latDir, lonDeg, lonMin, lonSec, lonDir] =
      dmsMatch;
    const lat = dmsToDec(
      parseInt(latDeg),
      parseInt(latMin),
      parseFloat(latSec),
      latDir
    );
    const lon = dmsToDec(
      parseInt(lonDeg),
      parseInt(lonMin),
      parseFloat(lonSec),
      lonDir
    );
    if (isValidIsraeliCoord(lat, lon)) {
      return [lat, lon];
    }
  }

  // Try DM format: DDMMN/DDDMME
  const dmMatch = coordStr.match(
    /(\d{2})(\d{2})([NS])\D*(\d{3})(\d{2})([EW])/
  );
  if (dmMatch) {
    const [, latDeg, latMin, latDir, lonDeg, lonMin, lonDir] = dmMatch;
    const lat = dmToDecimal(parseInt(latDeg), parseInt(latMin), latDir);
    const lon = dmToDecimal(parseInt(lonDeg), parseInt(lonMin), lonDir);
    if (isValidIsraeliCoord(lat, lon)) {
      return [lat, lon];
    }
  }

  return null;
}

export function parseQLineCoordinate(
  segment: string
): { type: 'circle' | 'point'; lat: number; lon: number; radiusNm: number } | null {
  // Q-line last segment format: DDMMSSN/DDDMMSSE/FL_RANGE/RADIUS
  // Extract: DDMMSS(N|S)/DDDMMSS(E|W)/altitude/radius
  // Support decimal seconds: DDMMSS.SS(N|S)/DDDMMSS.SS(E|W)
  // Also support compact format: DDMMSS.SSN0DDDMMSS.SSE/RADIUS

  const cleaned = segment.trim();

  // Try multiple patterns to find coordinates
  // Pattern 1: Traditional separated format with slashes
  let match = cleaned.match(
    /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])\D+(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])(?:\D+(\d+))?/
  );

  if (!match) {
    // Pattern 2: Compact format without separators
    match = cleaned.match(
      /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])0?(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])(?:\D+(\d+))?/
    );
  }

  let isDm = false;
  if (!match) {
    // Pattern 3: DM format (degrees+minutes only, no seconds). Common for
    // A-NOTAMs: e.g. "3200N03453E005" = 32°00'N 034°53'E radius 5 NM.
    const dm = cleaned.match(
      /^\s*(\d{2})(\d{2})([NS])0?(\d{3})(\d{2})([EW])(?:\D*(\d+))?/,
    );
    if (dm) {
      isDm = true;
      // Re-shape to the DMS groups our later code expects, with sec=0.
      match = [
        dm[0],
        dm[1], dm[2], '0', dm[3],
        dm[4], dm[5], '0', dm[6],
        dm[7],
      ] as unknown as RegExpMatchArray;
    }
  }

  if (!match) {
    return null;
  }

  const [
    ,
    latDeg,
    latMin,
    latSec,
    latDir,
    lonDeg,
    lonMin,
    lonSec,
    lonDir,
    radiusStr,
  ] = match;

  const lat = isDm
    ? dmToDecimal(parseInt(latDeg), parseInt(latMin), latDir)
    : dmsToDec(
        parseInt(latDeg),
        parseInt(latMin),
        parseFloat(latSec),
        latDir,
      );
  const lon = isDm
    ? dmToDecimal(parseInt(lonDeg), parseInt(lonMin), lonDir)
    : dmsToDec(
        parseInt(lonDeg),
        parseInt(lonMin),
        parseFloat(lonSec),
        lonDir,
      );

  if (!isValidIsraeliCoord(lat, lon)) {
    return null;
  }

  const radiusNm = radiusStr ? parseInt(radiusStr) : 0;

  return {
    type: radiusNm > 0 ? 'circle' : 'point',
    lat,
    lon,
    radiusNm,
  };
}

export function extractCoordinatesFromBody(eItem: string): NotamGeometry {
  // Extract all coordinate pairs from E-item
  // Look specifically for coordinates after "PSN" (Position) and other keywords
  // Support multiple formats:
  // 1. DDMMSS.SSN0DDDMMSS.SSE (compact, no separators)
  // 2. DDMMSS.SSN/DDDMMSS.SSE (with slash separator)
  // 3. DDMMN/DDDMME (DM format without seconds)

  const coords: Array<[number, number]> = [];
  let match;

  // Dedup is handled by the rounded lat/lon pass at the bottom — we let
  // overlapping patterns push freely and collapse collisions once.

  // Pattern 1a: PSN followed by coordinates with optional intermediate text
  const psnPattern1 = /PSN[S]?\s+[A-Z]*\s*(\d{2})(\d{2})(\d{2}(?:\.\d+)?)[NS]0?(\d{3})(\d{2})(\d{2}(?:\.\d+)?)[EW]/gi;

  while ((match = psnPattern1.exec(eItem)) !== null) {
    const coordStr = match[0];
    const latDir = coordStr.includes('N') ? 'N' : 'S';
    const lonDir = coordStr.includes('E') ? 'E' : 'W';

    const lat = dmsToDec(
      parseInt(match[1]),
      parseInt(match[2]),
      parseFloat(match[3]),
      latDir
    );
    const lon = dmsToDec(
      parseInt(match[4]),
      parseInt(match[5]),
      parseFloat(match[6]),
      lonDir
    );

    if (isValidIsraeliCoord(lat, lon)) {
      coords.push([lat, lon]);
    }
  }

  // Pattern 1b: Coordinates without decimal seconds (DDMMSSN format)
  // Like: N314945E0345822
  const psnPattern2 = /(?:PSN|PSNS|FLW\s+PSN)\s*[A-Z]*\s*(\d{2})(\d{2})(\d{2})[NS]0?(\d{3})(\d{2})(\d{2})[EW]/gi;

  while ((match = psnPattern2.exec(eItem)) !== null) {
    const coordStr = match[0];
    const latDir = coordStr.includes('N') ? 'N' : 'S';
    const lonDir = coordStr.includes('E') ? 'E' : 'W';

    const lat = dmsToDec(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3]),
      latDir
    );
    const lon = dmsToDec(
      parseInt(match[4]),
      parseInt(match[5]),
      parseInt(match[6]),
      lonDir
    );

    if (isValidIsraeliCoord(lat, lon)) {
      coords.push([lat, lon]);
    }
  }

  // Pattern 1c: Standalone coordinates without PSN keyword
  // Like: N314945E0345822 (appears at start of line or after whitespace).
  // Runs unconditionally so mixed-format NOTAMs (one PSN + several standalone)
  // don't drop coords; the lat/lon dedup below collapses any overlap.
  {
    const standalonePattern = /(?<=^|\s)([NS]\d{2})(\d{2})(\d{2})([EW]\d{3})(\d{2})(\d{2})(?=\s|$)/gm;

    while ((match = standalonePattern.exec(eItem)) !== null) {
      try {
        const latStr = match[1]; // Format: "N314945"
        const latDir = latStr[0];
        const latDeg = parseInt(latStr.substring(1, 3));
        const latMin = parseInt(match[2]);
        const latSec = parseInt(match[3]);

        const lonStr = match[4]; // Format: "E0345822"
        const lonDir = lonStr[0];
        const lonDeg = parseInt(lonStr.substring(1, 4));
        const lonMin = parseInt(match[5]);
        const lonSec = parseInt(match[6]);

        const lat = dmsToDec(latDeg, latMin, latSec, latDir as 'N' | 'S');
        const lon = dmsToDec(lonDeg, lonMin, lonSec, lonDir as 'E' | 'W');

        if (isValidIsraeliCoord(lat, lon)) {
          coords.push([lat, lon]);
        }
      } catch {
        // Skip if parsing fails
      }
    }
  }

  // Fallback patterns — run only if the PSN/standalone passes caught nothing.
  // These match bare coord-shaped strings anywhere in the body and have a
  // higher false-positive rate, so they gate on `coords.length === 0`.

  if (coords.length === 0) {
    // Compact format - DDMMSS.SSN0DDDMMSS.SSE (no separators)
    const compactPattern = /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)[NS]0?(\d{3})(\d{2})(\d{2}(?:\.\d+)?)[EW]/g;

    while ((match = compactPattern.exec(eItem)) !== null) {
      const coordStr = match[0];
      const latDir = coordStr.includes('N') ? 'N' : 'S';
      const lonDir = coordStr.includes('E') ? 'E' : 'W';

      const lat = dmsToDec(
        parseInt(match[1]),
        parseInt(match[2]),
        parseFloat(match[3]),
        latDir
      );
      const lon = dmsToDec(
        parseInt(match[4]),
        parseInt(match[5]),
        parseFloat(match[6]),
        lonDir
      );

      if (isValidIsraeliCoord(lat, lon)) {
        coords.push([lat, lon]);
      }
    }
  }

  if (coords.length === 0) {
    // Separated format - DD MM SS.SS N / DDD MM SS.SS E
    const sepPattern = /(\d{2})(\d{2})(\d{2}(?:\.\d+)?)\s*([NS])\s*[\D/]*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)\s*([EW])/g;

    while ((match = sepPattern.exec(eItem)) !== null) {
      const lat = dmsToDec(
        parseInt(match[1]),
        parseInt(match[2]),
        parseFloat(match[3]),
        match[4]
      );
      const lon = dmsToDec(
        parseInt(match[5]),
        parseInt(match[6]),
        parseFloat(match[7]),
        match[8]
      );

      if (isValidIsraeliCoord(lat, lon)) {
        coords.push([lat, lon]);
      }
    }
  }

  if (coords.length === 0) {
    // DM format only - DDMMN/DDDMME
    const dmPattern = /(\d{2})(\d{2})[NS]\s*[\D/]*(\d{3})(\d{2})[EW]/g;

    while ((match = dmPattern.exec(eItem)) !== null) {
      const coordStr = match[0];
      const latDir = coordStr.includes('N') ? 'N' : 'S';
      const lonDir = coordStr.includes('E') ? 'E' : 'W';

      const lat = dmToDecimal(parseInt(match[1]), parseInt(match[2]), latDir);
      const lon = dmToDecimal(parseInt(match[3]), parseInt(match[4]), lonDir);

      if (isValidIsraeliCoord(lat, lon)) {
        coords.push([lat, lon]);
      }
    }
  }

  // Dedup by rounded lat/lon (6 decimals ≈ 11 cm) — different format patterns
  // can emit the same point twice (e.g. one PSN-prefixed + one standalone
  // after Pattern 1c is unconditional). Preserve insertion order.
  const deduped: Array<[number, number]> = [];
  const seenKeys = new Set<string>();
  for (const [lat, lon] of coords) {
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push([lat, lon]);
  }

  if (deduped.length === 0) {
    return null;
  } else if (deduped.length === 1) {
    return {
      type: 'point',
      lat: deduped[0][0],
      lon: deduped[0][1],
    };
  }

  // Multiple coords: decide polygon vs multipoint. Many IAA NOTAMs (e.g.
  // C0770/26) list 10+ PSN coordinates that describe multiple separate areas
  // or a non-simple boundary — connecting them in listed order produces a
  // self-intersecting polygon which Leaflet's even-odd fill renders as an
  // "inside-out" shape. Fall back to multipoint rendering in that case.
  if (deduped.length >= 3 && isSelfIntersectingPolygon(deduped)) {
    return { type: 'multipoint', points: deduped };
  }
  return { type: 'polygon', vertices: deduped };
}

// Segment intersection test — returns true if two line segments properly
// cross (shared endpoints / collinear overlap don't count).
function segmentsIntersect(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): boolean {
  const ccw = (
    p: [number, number],
    q: [number, number],
    r: [number, number],
  ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = ccw(b1, b2, a1);
  const d2 = ccw(b1, b2, a2);
  const d3 = ccw(a1, a2, b1);
  const d4 = ccw(a1, a2, b2);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function isSelfIntersectingPolygon(verts: Array<[number, number]>): boolean {
  const n = verts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = verts[i];
    const a2 = verts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (share an endpoint) — and the wrap-around case
      // where j+1 wraps to i.
      if (i === 0 && j === n - 1) continue;
      const b1 = verts[j];
      const b2 = verts[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
