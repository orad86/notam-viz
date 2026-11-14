// Turns text copied from https://aeroinfo.iaa.gov.il/Notams (every entry
// expanded) into raw ICAO blocks that parseNotamBlock understands.

const ENTRY_HEADER = /^([A-Z]\d{4}\/\d{2})\s+Created:/;
const BLOCK_START = /^\(([A-Z]\d{4}\/\d{2})\s+NOTAM[NRC]\b/;
const BLOCK_END = /^(?:▲|▼|Total number of Notams:)/;
const TOTAL = /Total number of Notams:\s*(\d+)/i;

export interface ManualExtract {
  blocks: string[];
  entryIds: string[];
  blockIds: string[];
  declaredTotal: number | null;
}

// The site wraps each NOTAM in "( … )". Left in, the closing paren lands on
// whichever item is last: "REF.))" in E, "1500FT AMSL)" in G.
function stripOuterParens(block: string): string {
  let out = block.trim();
  if (out.startsWith('(')) out = out.slice(1);
  if (out.endsWith(')')) out = out.slice(0, -1);
  return out.trim();
}

export function extractManualBlocks(text: string): ManualExtract {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  const entryIds: string[] = [];
  const blockIds: string[] = [];
  let current: string[] | null = null;

  const flush = () => {
    if (current) blocks.push(stripOuterParens(current.join('\n')));
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const header = trimmed.match(ENTRY_HEADER);
    const start = trimmed.match(BLOCK_START);
    if (header || start || BLOCK_END.test(trimmed)) flush();
    if (header) entryIds.push(header[1]);
    if (start) {
      blockIds.push(start[1]);
      current = [line.replace(/\s+$/, '')];
    } else if (current && !header) {
      current.push(line.replace(/\s+$/, ''));
    }
  }
  flush();

  const total = text.match(TOTAL);
  return {
    blocks,
    entryIds,
    blockIds,
    declaredTotal: total ? Number(total[1]) : null,
  };
}

// Reasons not to publish. An entry without a block means it was copied
// collapsed, which would silently drop that NOTAM from the map.
export function validateManualExtract(x: ManualExtract): string[] {
  const problems: string[] = [];
  if (x.blocks.length === 0) {
    problems.push('No ICAO blocks found. Expand every entry before copying.');
  }
  const withBlock = new Set(x.blockIds);
  const missing = x.entryIds.filter((id) => !withBlock.has(id));
  if (missing.length > 0) {
    problems.push(`Entries copied without their ICAO text (collapsed): ${missing.join(', ')}`);
  }
  const dupes = x.blockIds.filter((id, i) => x.blockIds.indexOf(id) !== i);
  if (dupes.length > 0) {
    problems.push(`Duplicate NOTAMs in the copy: ${Array.from(new Set(dupes)).join(', ')}`);
  }
  if (x.declaredTotal !== null && x.declaredTotal !== x.blocks.length) {
    problems.push(
      `Page says ${x.declaredTotal} NOTAMs but ${x.blocks.length} blocks were found. Was the copy cut short?`,
    );
  }
  return problems;
}
