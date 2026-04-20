// Parse a user-supplied altitude string into feet AMSL.
// Handles FL100, 5500, 5500FT, SFC, GND, UNL, UNLIMITED, and common suffixes.
// Bare numbers are treated as feet (what a pilot typing "5500" means).
// Returns null when the string doesn't parse.

export function parseAltitudeFt(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;

  if (s === 'SFC' || s === 'GND' || s === 'MSL') return 0;
  if (s === 'UNL' || s === 'UNLIMITED' || s === 'UNLTD') return Infinity;

  const fl = s.match(/^FL\s*0*(\d{1,3})$/);
  if (fl) return Number(fl[1]) * 100;

  const ft = s.match(/^(\d{1,6})\s*(FT|FEET)?(AGL|AMSL|MSL|GND)?$/);
  if (ft) return Number(ft[1]);

  const m = s.match(/^(\d{1,5})\s*M$/);
  if (m) return Math.round(Number(m[1]) * 3.28084);

  return null;
}

// Parse NOTAM Q-line altitude codes. These are ICAO Annex 15 3-digit codes
// expressed in hundreds of feet, e.g. "005" = FL005 = 500 ft, "180" = FL180 =
// 18,000 ft. "000" / "SFC" = ground; "999" = unlimited. Different from
// user input ("5500") which means 5500 ft literally.
export function parseQLineAltitudeFt(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  if (s === 'SFC' || s === 'GND' || s === 'MSL') return 0;
  if (s === 'UNL' || s === 'UNLIMITED' || s === 'UNLTD') return Infinity;

  const digits = s.match(/^\d{1,3}$/);
  if (digits) {
    const n = Number(s);
    if (n === 999) return Infinity;
    return n * 100;
  }

  return parseAltitudeFt(s);
}

export function altitudeBandFt(
  lower: string | undefined,
  upper: string | undefined,
): { lower: number; upper: number } {
  const l = parseQLineAltitudeFt(lower);
  const u = parseQLineAltitudeFt(upper);
  return {
    lower: l ?? 0,
    upper: u ?? Infinity,
  };
}
