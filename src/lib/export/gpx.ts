import { ParsedNotam } from '@/types/notam';
import { escapeXml, timestampSuffix, triggerDownload } from './download';

function eItemOneLine(n: ParsedNotam): string {
  return (n.eItem || '')
    .replace(/^E\)\s*/, '')
    .replace(/E\)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wpt(
  lat: number,
  lon: number,
  name: string,
  desc: string,
  cmt?: string,
): string {
  const parts = [
    `<wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">`,
    `  <name>${escapeXml(name)}</name>`,
  ];
  if (cmt) parts.push(`  <cmt>${escapeXml(cmt)}</cmt>`);
  parts.push(`  <desc>${escapeXml(desc)}</desc>`);
  parts.push(`</wpt>`);
  return parts.join('\n');
}

function buildEntry(n: ParsedNotam): string {
  const g = n.geometry;
  if (!g) return '';
  const desc = eItemOneLine(n);

  if (g.type === 'point') {
    return wpt(g.lat, g.lon, n.notamId, desc);
  }

  if (g.type === 'circle') {
    return wpt(g.lat, g.lon, n.notamId, desc, `R=${g.radiusNm}NM`);
  }

  if (g.type === 'multipoint') {
    return g.points
      .map(([lat, lon], i) =>
        wpt(lat, lon, `${n.notamId}#${i + 1}`, desc),
      )
      .join('\n');
  }

  if (g.type === 'polygon') {
    const verts = g.vertices;
    if (verts.length === 0) return '';
    const closed = verts[0] !== verts[verts.length - 1] ? [...verts, verts[0]] : verts;
    const trkpts = closed
      .map(([lat, lon]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`)
      .join('\n');
    return [
      `<trk>`,
      `  <name>${escapeXml(n.notamId)}</name>`,
      `  <desc>${escapeXml(desc)}</desc>`,
      `  <trkseg>`,
      trkpts,
      `  </trkseg>`,
      `</trk>`,
    ].join('\n');
  }

  return '';
}

export function buildGpx(notams: ParsedNotam[]): string {
  const now = new Date().toISOString();
  const entries = notams.map(buildEntry).filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NOTAM Visualizer"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>NOTAM Export</name>
    <desc>${notams.length} NOTAMs exported from NOTAM Visualizer</desc>
    <time>${now}</time>
  </metadata>
${entries}
</gpx>
`;
}

export function downloadGpx(notams: ParsedNotam[]): void {
  const content = buildGpx(notams);
  triggerDownload(
    `notams-${timestampSuffix()}.gpx`,
    'application/gpx+xml',
    content,
  );
}
