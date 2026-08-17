// Plain-language decoding for NOTAMs.
//
// A NOTAM's E-item is ICAO shorthand: `RWY 12/30 CLSD DUE WIP`. This module
// turns a ParsedNotam into something a pilot can read at a glance without
// throwing away the source wording — see `tokenizeEItem` for why expansions
// are additive rather than substitutive.
//
// Pure. No React, no DOM. The detail sheet and the PDF export both consume it.

import { NotamCategory, ParsedNotam } from '@/types/notam';
import { decodeQCode } from './qcodes';
import {
  eItemText,
  formatAltitudeRange,
  formatScope,
  formatTraffic,
  formatUtcDate,
} from './format';

export type DecodedToken =
  | { kind: 'text'; text: string }
  | { kind: 'abbr'; raw: string; expanded: string };

export interface DecodedWhen {
  from: string;
  to: string;
  isPerm: boolean;
  schedule: string | null;
}

export interface DecodedNotam {
  /** One line: what happened and where. "Runway closed — LLBG" */
  headline: string;
  /** Subject and condition as separate readable phrases. */
  subject: string;
  condition: string | null;
  /** ICAO location indicator from the A-line. Never a friendly name — see note. */
  where: string | null;
  when: DecodedWhen;
  altitude: string | null;
  traffic: string | null;
  scope: string | null;
  /** E-item split into plain text and expandable abbreviations. */
  body: DecodedToken[];
}

// ICAO Doc 8400 contractions, narrowed to what actually shows up in Israeli
// NOTAMs. Keys are whole uppercase tokens; a token not listed here is passed
// through untouched, which is the safe default for a corpus this open-ended.
//
// Deliberately NOT included: bare words that are already readable in context
// (AREA, CLOSED, ROUTE), and anything whose expansion would be longer than the
// mental cost of just reading the original.
const ABBREVIATIONS: Record<string, string> = {
  ACFT: 'aircraft',
  ACT: 'active',
  AD: 'aerodrome',
  ADZ: 'advise',
  AGL: 'above ground level',
  AMSL: 'above mean sea level',
  APCH: 'approach',
  APN: 'apron',
  ARP: 'aerodrome reference point',
  ARR: 'arrival',
  AVBL: 'available',
  AWY: 'airway',
  BLW: 'below',
  BTN: 'between',
  CTC: 'contact',
  CTL: 'control',
  CLSD: 'closed',
  DEP: 'departure',
  DLY: 'daily',
  DME: 'distance measuring equipment',
  EXC: 'except',
  FIR: 'flight information region',
  FL: 'flight level',
  FREQ: 'frequency',
  FT: 'feet',
  GND: 'ground',
  HEL: 'helicopter',
  HGT: 'height',
  HJ: 'sunrise to sunset',
  HN: 'sunset to sunrise',
  HR: 'hours',
  HX: 'no specific working hours',
  ILS: 'instrument landing system',
  INFO: 'information',
  LGT: 'light',
  LGTD: 'lighted',
  MAINT: 'maintenance',
  MIL: 'military',
  MNM: 'minimum',
  MOV: 'movement',
  NM: 'nautical miles',
  OBST: 'obstacle',
  OPR: 'operator',
  OPS: 'operations',
  PERM: 'permanent',
  PSN: 'position',
  RESERV: 'reserved',
  RTE: 'route',
  RWY: 'runway',
  SFC: 'surface',
  SR: 'sunrise',
  SS: 'sunset',
  TEMPO: 'temporary',
  TEMPOR: 'temporary',
  TFC: 'traffic',
  THR: 'threshold',
  TWR: 'tower',
  TWY: 'taxiway',
  UNL: 'unlimited',
  'U/S': 'unserviceable',
  VOR: 'VHF omnidirectional range',
  WDI: 'wind direction indicator',
  WEF: 'with effect from',
  WI: 'within',
  WIP: 'work in progress',
};

// A token candidate: an uppercase run, allowing digits and the embedded slash
// that `U/S` and `W/I` use.
const TOKEN_RE = /[A-Z][A-Z0-9/]*/g;

// The regex can only anchor its own start, so `5NM` would match a trailing
// `NM`. Expansion is documented as whole-token, so reject any match that picks
// up mid-run. Done with an explicit character check rather than a `(?<!…)`
// lookbehind: Safari only shipped lookbehind in 16.4, and this ships inside a
// Capacitor WKWebView on older iOS.
function isWholeToken(text: string, index: number): boolean {
  if (index === 0) return true;
  return !/[A-Z0-9]/.test(text[index - 1]);
}

/**
 * Splits an E-item into plain text and recognised abbreviations.
 *
 * Expansions are returned ALONGSIDE the original token rather than replacing
 * it. A NOTAM is an operational document; a pilot cross-checking against the
 * official source needs to see the same words. The UI renders the expansion as
 * an annotation, so nothing the authority wrote is ever hidden or reworded.
 */
export function tokenizeEItem(text: string): DecodedToken[] {
  const tokens: DecodedToken[] = [];
  let lastIndex = 0;

  // `matchAll` needs the global flag, which carries `lastIndex` state across
  // calls — build a fresh regex per invocation so the function stays pure.
  const re = new RegExp(TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const expanded = ABBREVIATIONS[raw];
    if (!expanded || !isWholeToken(text, match.index)) continue;

    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
    }
    tokens.push({ kind: 'abbr', raw, expanded });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', text: text.slice(lastIndex) });
  }

  return tokens;
}

// D-line diurnal schedules look like `MON-FRI 0600-1800` or `DAILY 0700-1500`.
// The grammar is loose enough that a full parser would be mostly wrong, so this
// only expands the vocabulary and normalises the time notation, leaving the
// structure the authority wrote intact.
const SCHEDULE_WORDS: Record<string, string> = {
  DLY: 'daily',
  DAILY: 'daily',
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
  EXC: 'except',
  AND: 'and',
  HJ: 'sunrise to sunset',
  HN: 'sunset to sunrise',
  SR: 'sunrise',
  SS: 'sunset',
};

export function decodeSchedule(dLine: string | undefined): string | null {
  const raw = (dLine ?? '').replace(/^D\)\s*/, '').trim();
  if (!raw) return null;

  return raw
    .split(/\s+/)
    .map((word) => {
      // Real D-lines comma-separate their clauses ("16 0800-1500 1600-2059,
      // 17 0600-0900"), so match on the bare word and re-attach whatever
      // punctuation surrounded it. Anchoring on the raw token silently skipped
      // every time range that happened to end a clause.
      const [, lead = '', core = '', trail = ''] =
        /^([^\w]*)(.*?)([^\w]*)$/.exec(word) ?? [];
      const upper = core.toUpperCase();

      const mapped = SCHEDULE_WORDS[upper];
      if (mapped) return `${lead}${mapped}${trail}`;

      // 0600-1800 -> 0600Z-1800Z. NOTAM times are always UTC; saying so
      // removes the single most common misreading of a D-line.
      if (/^\d{4}-\d{4}$/.test(upper)) {
        const [from, to] = upper.split('-');
        return `${lead}${from}Z-${to}Z${trail}`;
      }
      return word;
    })
    .join(' ');
}

// `decodeQCode` returns sentinel strings rather than null for unknown input.
// Treat those as "no information" instead of printing them at a pilot.
function usable(description: string): string | null {
  if (!description) return null;
  if (description.startsWith('Unknown ')) return null;
  if (description.startsWith('Invalid ')) return null;
  return description;
}

// SUBJECT_DESCRIPTIONS are formatted "Group - Thing" (e.g. "Movement - Runway").
// The group is a taxonomy artefact; the thing is what the pilot cares about.
function subjectPhrase(description: string | null): string | null {
  if (!description) return null;
  const dash = description.indexOf(' - ');
  return dash === -1 ? description : description.slice(dash + 3);
}

// When the Q-code subject is unknown, the app's own category bucket is a better
// fallback than a bare "Notice": live data produced headlines like "Notice
// closed", where the category already knew it was airspace.
const CATEGORY_SUBJECT: Record<NotamCategory, string | null> = {
  airspace: 'Airspace',
  obstacle: 'Obstacle',
  navaid: 'Navaid',
  runway: 'Runway',
  airport: 'Aerodrome',
  procedure: 'Procedure',
  military: 'Military area',
  other: null,
};

export function decodeNotam(n: ParsedNotam): DecodedNotam {
  const parts = decodeQCode(n.qCode ?? '');
  const subject =
    subjectPhrase(usable(parts.subjectDescription)) ??
    CATEGORY_SUBJECT[n.category] ??
    'Notice';

  const rawCondition = usable(parts.conditionDescription);
  // QXXXX means "plain language, no standardised code" — there is no condition
  // to state, and echoing the table's explanation would be noise.
  const condition =
    parts.conditionCode === 'XX' || !rawCondition ? null : rawCondition;

  const where = n.location?.trim() || n.fir?.trim() || null;

  const headlineCore = condition
    ? `${subject} ${condition.toLowerCase()}`
    : subject;
  const headline = where ? `${headlineCore} — ${where}` : headlineCore;

  const isPerm = n.expires === 'PERM';

  return {
    headline,
    subject,
    condition,
    where,
    when: {
      from: formatUtcDate(n.effective),
      to: isPerm ? 'Permanent' : formatUtcDate(n.expires),
      isPerm,
      schedule: decodeSchedule(n.dLine),
    },
    altitude: formatAltitudeRange(n),
    traffic: formatTraffic(n.significance),
    scope: formatScope(n.scope),
    body: tokenizeEItem(eItemText(n)),
  };
}
