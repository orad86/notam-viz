import { ParsedNotam, NotamCategory, NotamGeometry } from '@/types/notam';
import { parseQLineCoordinate, extractCoordinatesFromBody } from './coord-parser';
import { getCategoryFromQLine } from './qcode-subjects';
import { decodeQCode, formatQCodeExplanation } from './qcode-decoder';
import { getAirportCoords } from './airport-coords';

function extractItem(raw: string, letter: string): string {
  // Stop at the next field marker whether it's on a new line (desktop layout)
  // or same-line whitespace-separated (mobile layout: "A) LLLL B) 26... C) PERM").
  const pattern = new RegExp(`\\b${letter}\\)\\s*([\\s\\S]*?)(?=\\s[A-GQ]\\)|$)`);
  const match = raw.match(pattern);
  return match ? match[1].trim() : '';
}

function parseNotamDate(dateStr: string): string {
  // Format: YYMMDDHHMM
  if (!dateStr || dateStr.length < 10) {
    return new Date().toISOString();
  }

  const yy = parseInt(dateStr.substring(0, 2));
  const mm = parseInt(dateStr.substring(2, 4));
  const dd = parseInt(dateStr.substring(4, 6));
  const hh = parseInt(dateStr.substring(6, 8));
  const mn = parseInt(dateStr.substring(8, 10));

  // Assume 20xx for yy < 50, otherwise 19xx
  const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;

  const date = new Date(yyyy, mm - 1, dd, hh, mn, 0, 0);
  return date.toISOString();
}

function determineCategory(qLine: string, eItem: string): NotamCategory {
  // First try to extract Q-code from Q-line using standardized mapping
  const qCodeCategory = getCategoryFromQLine(qLine);
  if (qCodeCategory !== 'other') {
    return qCodeCategory;
  }

  // Fallback: analyze E-item text for keywords
  const text = (eItem + qLine).toUpperCase();

  if (text.includes('RUNWAY') || text.includes('RWY') || text.includes('THR') || text.includes('APRON')) {
    return 'runway';
  }
  if (text.includes('OBSTACLE') || text.includes('CRANE') || text.includes('TOWER') || text.includes('WIND') && text.includes('FARM')) {
    return 'obstacle';
  }
  if (text.includes('NAVAID') || text.includes('VOR') || text.includes('NDB') || text.includes('BEACON')) {
    return 'navaid';
  }
  // Note: `APRON` is intentionally NOT listed here — it's already matched by
  // the runway branch above (first branch wins), so listing it here would be
  // dead code. Keep airport to the aviation-facility verbs.
  if (text.includes('REFUEL') || text.includes('STAND') || text.includes('PARKING')) {
    return 'airport';
  }
  if (text.includes('MILITARY') || text.includes('RESTRICTED') || text.includes('DANGER')) {
    return 'military';
  }
  if (text.includes('PROCEDURE') || text.includes('APPROACH') || text.includes('ARRIVAL') || text.includes('DEPARTURE')) {
    return 'procedure';
  }
  // Keep this tight: the Q-code mapping in `getCategoryFromQLine` handles
  // airspace NOTAMs correctly (Axx, RAx). The prior version matched CLSD /
  // AREA / country names and swallowed most other NOTAMs into 'airspace'.
  if (
    text.includes('AIRSPACE') ||
    text.includes('WARNING AREA') ||
    text.includes('TEMPORARY RESERVED AREA') ||
    text.includes('ATS ROUTE')
  ) {
    return 'airspace';
  }

  return 'other';
}

export function parseNotamBlock(raw: string): ParsedNotam | null {
  // Extract NOTAM ID from first line. Returns null for garbage input; the
  // caller is responsible for aggregating/logging failures so the parser
  // stays pure (no side effects).
  const idMatch = raw.match(/[A-Z]\d{4}\/\d{2}/);
  if (!idMatch) {
    return null;
  }
  const notamId = idMatch[0];

  // Extract Q-line (item Q)
  let qLine = extractItem(raw, 'Q');

  // If Q-line is empty, try to extract from continuation (some formats have it on second line)
  if (!qLine) {
    const lines = raw.split('\n');
    for (const line of lines) {
      if (line.includes('/')) {
        qLine = line.trim();
        break;
      }
    }
  }

  // If still no Q-line, create a minimal one from E-item
  if (!qLine) {
    qLine = 'LLLL/UNK////';
  }

  // Parse Q-line: FIR/CODE/SIGNIFICANCE/PRIORITY/SCOPE/LOWER/UPPER/COORD/RADIUS
  const qParts = qLine.split('/');
  const fir = qParts[0] || 'LLLL';
  const qCodeFull = qParts[1] || 'QXXXX'; // Full 5-letter code
  const qCodeDecoded = decodeQCode(qCodeFull);
  const subject = qCodeDecoded.subjectCode || 'UNK';
  const significance = qParts[2] || ''; // IV/I/V
  const priority = qParts[3] || ''; // NBO/SIB/T
  const scope = qParts[4] || ''; // A/E/W
  const lowerLimit = qParts[5] || '';
  const upperLimit = qParts[6] || '';

  // Extract coordinates from Q-line last segment if available
  let qCoord = null;
  if (qParts.length > 7 && qParts[qParts.length - 1]) {
    const lastSegment = qParts[qParts.length - 1];
    qCoord = parseQLineCoordinate(lastSegment);
  }

  // Extract all NOTAM fields
  const aItem = extractItem(raw, 'A');
  const bItem = extractItem(raw, 'B');
  const cItem = extractItem(raw, 'C');
  const dItem = extractItem(raw, 'D');
  const eItem = extractItem(raw, 'E');
  const fItem = extractItem(raw, 'F');
  const gItem = extractItem(raw, 'G');

  // Try to extract polygon/point from E-item body (especially after PSN)
  const bodyGeometry = extractCoordinatesFromBody(eItem);

  // Preference: body geometry (most specific) → Q-line coord → airport lookup
  // from A-line or FIR (last resort so A-NOTAMs still pin somewhere useful).
  let geometry: NotamGeometry = bodyGeometry || qCoord || null;
  if (!geometry) {
    const airport =
      getAirportCoords(aItem) || getAirportCoords(fir);
    if (airport) {
      geometry = { type: 'point', lat: airport.lat, lon: airport.lon };
    }
  }

  // Parse dates
  const effective = bItem ? parseNotamDate(bItem) : parseNotamDate(aItem);
  const isPermanent = cItem.toUpperCase().includes('PERM');
  const expires = isPermanent
    ? 'PERM'
    : cItem
      ? parseNotamDate(cItem)
      : new Date(Date.now() + 31536000000).toISOString(); // +1 year

  // Determine if currently active
  const now = new Date();
  const effectiveDate = new Date(effective);
  let isActive = effectiveDate <= now;

  if (isPermanent) {
    isActive = true;
  } else if (expires !== 'PERM') {
    const expiresDate = new Date(expires);
    isActive = isActive && expiresDate > now;
  }

  // Derive title
  const eItemPreview = eItem.substring(0, 80).replace(/\s+/g, ' ');
  const title = `${subject} ${eItemPreview}`.trim();

  const category = determineCategory(qLine, eItem);

  return {
    notamId,
    id: notamId, // Keep for backwards compatibility
    fir,
    qCode: qCodeFull,
    qCodeExplanation: formatQCodeExplanation(qCodeFull),
    significance,
    priority,
    scope,
    lowerLimit,
    upperLimit,
    location: aItem, // A-line location
    bLine: bItem,
    cLine: cItem,
    dLine: dItem,
    fLine: fItem,
    gLine: gItem,
    subject,
    geometry,
    effective,
    expires,
    eItem,
    category,
    isActive,
    title,
    rawText: raw,
  };
}

export function splitNotamBlocks(text: string): string[] {
  // Split by NOTAM ID pattern at line start
  const blocks = text.split(/(?=\n[A-Z]\d{4}\/\d{2})/);
  return blocks
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && /[A-Z]\d{4}\/\d{2}/.test(b));
}
