import { ParsedNotam, NotamCategory } from '@/types/notam';
import { getCategoryColor } from '@/lib/notam/format';
import { escapeXml, timestampSuffix, triggerDownload } from './download';

const CATEGORIES: NotamCategory[] = [
  'airspace',
  'obstacle',
  'navaid',
  'runway',
  'airport',
  'procedure',
  'military',
  'other',
];

// KML color is aabbggrr (alpha, blue, green, red). Input hex is #rrggbb.
function kmlColor(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${aa}${bb}${gg}${rr}`;
}

function buildStyles(): string {
  return CATEGORIES.map((cat) => {
    const hex = getCategoryColor(cat);
    return `
  <Style id="cat-${cat}">
    <LineStyle>
      <color>${kmlColor(hex, 0.95)}</color>
      <width>2</width>
    </LineStyle>
    <PolyStyle>
      <color>${kmlColor(hex, 0.25)}</color>
    </PolyStyle>
    <IconStyle>
      <color>${kmlColor(hex, 0.95)}</color>
      <scale>1.0</scale>
      <Icon>
        <href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
      </Icon>
    </IconStyle>
  </Style>`;
  }).join('');
}

function circleToPolygon(
  lat: number,
  lon: number,
  radiusNm: number,
  segments = 72,
): Array<[number, number]> {
  const earthR = 3440.065; // nautical miles
  const latRad = (lat * Math.PI) / 180;
  const cosLat = Math.max(Math.cos(latRad), 0.01);
  const dLat = radiusNm / 60;
  const dLon = dLat / cosLat;
  void earthR;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    pts.push([lat + dLat * Math.cos(theta), lon + dLon * Math.sin(theta)]);
  }
  return pts;
}

function eItemText(n: ParsedNotam): string {
  return (n.eItem || '').replace(/^E\)\s*/, '').replace(/E\)\s*/g, '').trim();
}

function timeSpan(n: ParsedNotam): string {
  const parts: string[] = [];
  parts.push(`      <begin>${escapeXml(n.effective)}</begin>`);
  if (n.expires !== 'PERM') {
    parts.push(`      <end>${escapeXml(n.expires)}</end>`);
  }
  return ['    <TimeSpan>', ...parts, '    </TimeSpan>'].join('\n');
}

function description(n: ParsedNotam): string {
  const lines = [
    `ID: ${n.notamId}`,
    `Category: ${n.category}`,
    `FIR: ${n.fir}`,
    n.location ? `Location: ${n.location}` : null,
    `Q-code: ${n.qCode}${n.qCodeExplanation ? ' — ' + n.qCodeExplanation : ''}`,
    `Effective: ${n.effective}`,
    `Expires: ${n.expires}`,
    '',
    eItemText(n),
  ]
    .filter(Boolean)
    .join('\n');
  return lines;
}

function coordString(points: Array<[number, number]>): string {
  return points.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)},0`).join(' ');
}

function buildPlacemark(n: ParsedNotam): string {
  const g = n.geometry;
  if (!g) return '';

  const header = [
    `  <Placemark>`,
    `    <name>${escapeXml(n.notamId)}</name>`,
    `    <description><![CDATA[${description(n).replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>`,
    `    <styleUrl>#cat-${n.category}</styleUrl>`,
    timeSpan(n),
  ].join('\n');

  let geometryXml = '';

  if (g.type === 'point') {
    geometryXml = [
      `    <Point>`,
      `      <coordinates>${g.lon.toFixed(6)},${g.lat.toFixed(6)},0</coordinates>`,
      `    </Point>`,
    ].join('\n');
  } else if (g.type === 'circle') {
    const pts = circleToPolygon(g.lat, g.lon, g.radiusNm);
    geometryXml = [
      `    <Polygon>`,
      `      <outerBoundaryIs><LinearRing>`,
      `        <coordinates>${coordString(pts)}</coordinates>`,
      `      </LinearRing></outerBoundaryIs>`,
      `    </Polygon>`,
    ].join('\n');
  } else if (g.type === 'polygon') {
    const verts = g.vertices;
    const closed =
      verts.length > 0 && verts[0] !== verts[verts.length - 1]
        ? [...verts, verts[0]]
        : verts;
    geometryXml = [
      `    <Polygon>`,
      `      <outerBoundaryIs><LinearRing>`,
      `        <coordinates>${coordString(closed)}</coordinates>`,
      `      </LinearRing></outerBoundaryIs>`,
      `    </Polygon>`,
    ].join('\n');
  } else if (g.type === 'multipoint') {
    const points = g.points
      .map(
        ([lat, lon]) =>
          `      <Point><coordinates>${lon.toFixed(6)},${lat.toFixed(6)},0</coordinates></Point>`,
      )
      .join('\n');
    geometryXml = [`    <MultiGeometry>`, points, `    </MultiGeometry>`].join('\n');
  }

  return [header, geometryXml, `  </Placemark>`].join('\n');
}

export function buildKml(notams: ParsedNotam[]): string {
  const now = new Date().toISOString();
  const placemarks = notams.map(buildPlacemark).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>NOTAM Export</name>
  <description>${notams.length} NOTAMs exported from NOTAM Visualizer on ${escapeXml(now)}</description>
${buildStyles()}
${placemarks}
</Document>
</kml>
`;
}

export function downloadKml(notams: ParsedNotam[]): void {
  const content = buildKml(notams);
  triggerDownload(
    `notams-${timestampSuffix()}.kml`,
    'application/vnd.google-earth.kml+xml',
    content,
  );
}
