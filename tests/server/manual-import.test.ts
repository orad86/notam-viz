import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractManualBlocks, validateManualExtract } from '@/lib/server/manual-import';
import { buildPayload } from '@/lib/server/publish';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Verbatim copy of six expanded entries from aeroinfo.iaa.gov.il/Notams.
const copy = readFileSync(join(__dirname, '../fixtures/iaa/aeroinfo-copy.txt'), 'utf8');

describe('extractManualBlocks', () => {
  const x = extractManualBlocks(copy);

  it('finds every entry, its block, and the declared total', () => {
    expect(x.entryIds).toEqual(['C2392/26', 'A0897/26', 'C2381/26', 'C2318/26', 'C2250/26', 'C0010/26']);
    expect(x.blockIds).toEqual(x.entryIds);
    expect(x.declaredTotal).toBe(6);
    expect(validateManualExtract(x)).toEqual([]);
  });

  it('strips the outer parentheses but keeps the inner ones', () => {
    const a0897 = x.blocks[1];
    expect(a0897.startsWith('A0897/26 NOTAMR A0691/26')).toBe(true);
    expect(a0897.endsWith('PARA 2.18 REF.)')).toBe(true);
    expect(a0897).toContain('(CPT)');
  });

  it('keeps the multi-line checklist inside one block', () => {
    expect(x.blocks[3]).toContain('LATEST PUBLICATIONS');
    expect(x.blocks[3].endsWith('AIP MIL\nNIL')).toBe(true);
  });

  it('accepts Windows line endings', () => {
    expect(extractManualBlocks(copy.replace(/\n/g, '\r\n')).blocks).toEqual(x.blocks);
  });
});

describe('parsing the extracted blocks', () => {
  const payload = buildPayload(extractManualBlocks(copy).blocks, {
    fetchedAt: '2026-11-14T00:00:00.000Z',
    source: 'test',
  });
  const byId = Object.fromEntries(payload.notams.map((n) => [n.notamId, n]));

  it('parses all six with no errors', () => {
    expect(payload.count).toBe(6);
    expect(payload.errors).toBeUndefined();
  });

  it('leaves no stray closing paren on the last item', () => {
    expect(byId['A0897/26'].eItem.endsWith('REF.)')).toBe(true);
    expect(byId['C2381/26'].gLine).toBe('1500FT AMSL');
    expect(byId['C2250/26'].gLine).toBe('UNL');
    expect(byId['C0010/26'].gLine).toBe('1000FT AMSL');
  });

  it('reads the ICAO items the old detail pages carried', () => {
    expect(byId['A0897/26'].qCode).toBe('QCACS');
    expect(byId['A0897/26'].location).toBe('LLHA');
    expect(byId['A0897/26'].expires).toBe('PERM');
    expect(byId['C2381/26'].fLine).toBe('GND');
    expect(byId['C0010/26'].geometry?.type).toBe('polygon');
  });
});

describe('validateManualExtract', () => {
  it('refuses an entry that was copied collapsed', () => {
    const collapsed = copy.replace(/\(C2381\/26 NOTAMN[\s\S]*?1500FT AMSL\)\n/, '');
    const problems = validateManualExtract(extractManualBlocks(collapsed));
    expect(problems.join('\n')).toContain('C2381/26');
  });

  it('refuses a copy whose block count disagrees with the page total', () => {
    const short = copy.replace('Total number of Notams: 6', 'Total number of Notams: 94');
    expect(validateManualExtract(extractManualBlocks(short)).join('\n')).toContain('94');
  });

  it('refuses a copy with no blocks at all', () => {
    expect(validateManualExtract(extractManualBlocks('nothing here'))).toHaveLength(1);
  });
});
