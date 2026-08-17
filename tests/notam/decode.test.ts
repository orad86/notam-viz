import { describe, it, expect } from 'vitest';
import {
  decodeNotam,
  decodeSchedule,
  tokenizeEItem,
  type DecodedToken,
} from '@/lib/notam/decode';
import { parseNotamBlock } from '@/lib/notam/parser';
import type { ParsedNotam } from '@/types/notam';

function parse(block: string): ParsedNotam {
  const n = parseNotamBlock(block);
  if (!n) throw new Error('fixture failed to parse');
  return n;
}

// Flattens tokens back to the source string. Every test that touches the body
// asserts this round-trips: expansions are additive annotations, so losing or
// rewriting a character would be a correctness bug, not a cosmetic one.
function flatten(tokens: DecodedToken[]): string {
  return tokens.map((t) => (t.kind === 'text' ? t.text : t.raw)).join('');
}

const RUNWAY_CLOSED = `A0002/26 NOTAMN
Q) LLLL/QMRLC/IV/NBO/A/000/999/3200N03450E005
A) LLBG B) 2601010000 C) 2612312359
E) RWY 12/30 CLSD DUE WIP`;

const PLAIN_LANGUAGE = `A0006/26 NOTAMN
Q) LLLL/QMRXX/IV/NBO/A/000/999/3200N03450E005
A) LLBG B) 2601010000 C) PERM
E) RWY 12/30 SURFACE IRREGULAR`;

const NO_QLINE = `A0005/26 NOTAMN
A) LLBG B) 2601010000 C) 2612312359
E) GENERIC NOTICE`;

describe('tokenizeEItem', () => {
  it('expands known contractions without discarding the original token', () => {
    const tokens = tokenizeEItem('RWY 12/30 CLSD DUE WIP');
    const abbrs = tokens.filter((t) => t.kind === 'abbr');

    expect(abbrs).toEqual([
      { kind: 'abbr', raw: 'RWY', expanded: 'runway' },
      { kind: 'abbr', raw: 'CLSD', expanded: 'closed' },
      { kind: 'abbr', raw: 'WIP', expanded: 'work in progress' },
    ]);
    expect(flatten(tokens)).toBe('RWY 12/30 CLSD DUE WIP');
  });

  it('passes unknown tokens through untouched', () => {
    const tokens = tokenizeEItem('BANANA QUUX ZZZZ');
    expect(tokens.every((t) => t.kind === 'text')).toBe(true);
    expect(flatten(tokens)).toBe('BANANA QUUX ZZZZ');
  });

  // The dictionary must not fire on ordinary words that happen to be in the
  // all-caps stream. AREA / CLOSED / ROUTE are deliberately absent from it.
  it('leaves already-readable words alone', () => {
    const tokens = tokenizeEItem('WARNING AREA CLOSED FOR ROUTE CHANGE');
    expect(tokens.filter((t) => t.kind === 'abbr')).toHaveLength(0);
    expect(flatten(tokens)).toBe('WARNING AREA CLOSED FOR ROUTE CHANGE');
  });

  // A coordinate blob is one long token; it must not match FT, NM or similar
  // by accident.
  it('does not tokenize inside coordinate blobs', () => {
    const tokens = tokenizeEItem('PSN N314000E0344500 RADIUS 5NM');
    const raws = tokens.filter((t) => t.kind === 'abbr').map((t) => t.raw);

    expect(raws).toEqual(['PSN']);
    expect(flatten(tokens)).toBe('PSN N314000E0344500 RADIUS 5NM');
  });

  it('handles the embedded slash in U/S', () => {
    const tokens = tokenizeEItem('ILS RWY 26 U/S');
    const raws = tokens.filter((t) => t.kind === 'abbr').map((t) => t.raw);

    expect(raws).toContain('U/S');
    expect(flatten(tokens)).toBe('ILS RWY 26 U/S');
  });

  it('returns nothing for empty input', () => {
    expect(tokenizeEItem('')).toEqual([]);
  });
});

describe('decodeSchedule', () => {
  it('expands day and keyword vocabulary and marks times as UTC', () => {
    expect(decodeSchedule('MON-FRI 0600-1800')).toBe('MON-FRI 0600Z-1800Z');
    expect(decodeSchedule('DLY 0700-1500')).toBe('daily 0700Z-1500Z');
    expect(decodeSchedule('D) HJ')).toBe('sunrise to sunset');
  });

  // Live D-lines comma-separate their clauses. Anchoring the time-range match on
  // the raw whitespace token skipped every range that ended one, so a real
  // schedule came out half-converted: "0800Z-1500Z 1600-2059,".
  it('converts time ranges that carry clause punctuation', () => {
    expect(decodeSchedule('16 0800-1500 1600-2059, 17 0600-0900')).toBe(
      '16 0800Z-1500Z 1600Z-2059Z, 17 0600Z-0900Z',
    );
    // SAT also picks up its vocabulary expansion despite the trailing clause.
    expect(decodeSchedule('MON-FRI 0600-1800, SAT 0800-1200')).toBe(
      'MON-FRI 0600Z-1800Z, Sat 0800Z-1200Z',
    );
  });

  it('returns null for a missing or empty D-line', () => {
    expect(decodeSchedule(undefined)).toBeNull();
    expect(decodeSchedule('')).toBeNull();
    expect(decodeSchedule('   ')).toBeNull();
  });
});

describe('decodeNotam', () => {
  it('builds a headline from the Q-code subject and condition', () => {
    const d = decodeNotam(parse(RUNWAY_CLOSED));

    expect(d.subject).toBe('Runway');
    expect(d.condition).toBe('Closed');
    expect(d.where).toBe('LLBG');
    expect(d.headline).toBe('Runway closed — LLBG');
  });

  // QMRXX means "encoded in plain language". There is no condition to state,
  // so the headline must not append the table's explanation of that fact.
  it('omits the condition for an XX (plain language) Q-code', () => {
    const d = decodeNotam(parse(PLAIN_LANGUAGE));

    expect(d.condition).toBeNull();
    expect(d.headline).toBe('Runway — LLBG');
  });

  it('reports PERM expiry as permanent', () => {
    const d = decodeNotam(parse(PLAIN_LANGUAGE));

    expect(d.when.isPerm).toBe(true);
    expect(d.when.to).toBe('Permanent');
  });

  // A NOTAM with no Q-line still has to render. Nothing may leak the
  // "Unknown subject code: .." / "Invalid Q-code format" sentinels to the UI.
  it('degrades gracefully with no Q-code', () => {
    const d = decodeNotam(parse(NO_QLINE));

    expect(d.subject).toBe('Notice');
    expect(d.condition).toBeNull();
    expect(d.headline).not.toMatch(/Unknown|Invalid/);
    expect(d.headline).toBe('Notice — LLBG');
  });

  // Live data produced "Notice closed" for NOTAMs whose Q-subject is not in the
  // table. The category bucket already knew better, so it is the fallback ahead
  // of the generic word.
  it('falls back to the category when the Q-subject is unknown', () => {
    const d = decodeNotam(
      parse(`C1900/26 NOTAMN
Q) LLLL/QZZLC/IV/NBO/W/000/999/3200N03450E005
A) LLLL B) 2601010000 C) 2601022359
E) AIRSPACE CLSD`),
    );

    expect(d.subject).toBe('Airspace');
    expect(d.headline).toBe('Airspace closed — LLLL');
  });

  // The AR addition to the Q-code subject table, end to end: this is the shape
  // that read "Navaid closed" against the live feed.
  it('names an ATS route closure from QARLC', () => {
    const d = decodeNotam(
      parse(`C1756/26 NOTAMN
Q) LLLL/QARLC/IV/NBO/W/000/999/3200N03450E005
A) LLLL B) 2601010000 C) 2601022359
E) HEL RTE CLSD`),
    );

    expect(d.headline).toBe('ATS route closed — LLLL');
  });

  it('preserves the E-item text exactly through the body tokens', () => {
    const d = decodeNotam(parse(RUNWAY_CLOSED));
    expect(flatten(d.body)).toBe('RWY 12/30 CLSD DUE WIP');
  });

  it('survives a garbage block that still parses', () => {
    const d = decodeNotam(parse(`A0009/26 NOTAMN
A) LLBG B) 2601010000 C) 2612312359
E)`));

    expect(d.body).toEqual([]);
    expect(d.headline).toBe('Notice — LLBG');
  });
});
