import { parseNotamBlock } from '../notam/parser';
import type { NotamApiResponse } from '@/types/notam';
import { log } from './log';

export function buildPayload(
  rawBlocks: string[],
  opts: { fetchedAt: string; source: string; extraErrors?: string[] },
): NotamApiResponse {
  const notams: NotamApiResponse['notams'] = [];
  const errors: string[] = [];
  const nullSamples: string[] = [];
  let nullCount = 0;

  for (const block of rawBlocks) {
    try {
      const parsed = parseNotamBlock(block);
      if (parsed) {
        notams.push(parsed);
      } else {
        nullCount++;
        errors.push('Parser returned null for a block');
        if (nullSamples.length < 3) nullSamples.push(block.slice(0, 120));
      }
    } catch (error) {
      errors.push(
        `parseNotamBlock failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (nullCount > 0) {
    log('warn', 'parser.null_blocks', { nullCount, samples: nullSamples });
  }

  errors.push(...(opts.extraErrors ?? []));

  return {
    notams,
    fetchedAt: opts.fetchedAt,
    source: opts.source,
    count: notams.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
