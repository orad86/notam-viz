import { ParsedNotam } from '@/types/notam';

export function formatUtcDate(iso: string): string {
  // `new Date(bad)` returns an Invalid Date object — it does NOT throw —
  // so guarding with try/catch alone leaks "NaN-NaN-NaN NaNNaNZ" into the
  // UI. Detect Invalid Date explicitly and pass the original string through.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${HH}${MM}Z`;
}

function trimTrailingParen(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/\)\s*$/, '').trim();
}

// Cleans the raw E-item body for display/export: strips the leading `E)`
// marker (and any inline `E)` markers, defensively), then trims edges.
// Whitespace inside the body is preserved — callers wanting a single-line
// form should follow up with `.replace(/\s+/g, ' ')`.
export function eItemText(n: ParsedNotam): string {
  const text = (n.eItem ?? '')
    .replace(/^E\)\s*/, '')
    .replace(/E\)\s*/g, '')
    .trim();

  // The IAA feed leaves an unmatched `)` on the end of many E-items (an
  // artefact of how the source page delimits the field), so live text reads
  // "AD CLSD DUE WIP.)". Only strip it when nothing opened it — a NOTAM whose
  // body legitimately ends in a parenthetical keeps its punctuation.
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (closes > opens && text.endsWith(')')) {
    return text.slice(0, -1).trim();
  }
  return text;
}

export function formatAltitudeRange(n: ParsedNotam): string | null {
  const f = trimTrailingParen(n.fLine);
  const g = trimTrailingParen(n.gLine);
  if (f && g) return `${f} → ${g}`;
  if (f || g) return f || g;
  const lo = n.lowerLimit?.trim();
  const hi = n.upperLimit?.trim();
  if (lo && hi) return `FL${lo} → FL${hi}`;
  if (lo || hi) return lo || hi || null;
  return null;
}

export function formatScope(scope?: string): string | null {
  const s = (scope || '').trim().toUpperCase();
  if (!s) return null;
  if (s.includes('A') && s.includes('E')) return 'Aerodrome + En-route';
  if (s === 'A') return 'Aerodrome';
  if (s === 'E') return 'En-route';
  if (s === 'W') return 'Warning';
  return s;
}

export function formatTraffic(sig?: string): string | null {
  const s = (sig || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'IV') return 'IFR/VFR';
  if (s === 'I') return 'IFR';
  if (s === 'V') return 'VFR';
  return s;
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'airspace':
      return '#3b82f6';
    case 'obstacle':
      return '#ef4444';
    case 'navaid':
      return '#a855f7';
    case 'runway':
      return '#f59e0b';
    case 'airport':
      return '#22c55e';
    case 'procedure':
      return '#06b6d4';
    case 'military':
      return '#8b5cf6';
    default:
      return '#6b7280';
  }
}

export const FIR_SCALE_RADIUS_NM = 150;
