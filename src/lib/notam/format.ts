import { ParsedNotam } from '@/types/notam';

export function formatUtcDate(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const MM = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${HH}${MM}Z`;
  } catch {
    return iso;
  }
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
  return (n.eItem ?? '').replace(/^E\)\s*/, '').replace(/E\)\s*/g, '').trim();
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
