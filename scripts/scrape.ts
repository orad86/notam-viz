import { scrapeMobileNotams } from '../src/lib/server/scraper-mobile';
import { parseNotamBlock } from '../src/lib/notam-parser';
import { setLatestNotams } from '../src/lib/server/kv';
import { IAA_LIST_URL } from '../src/lib/server/config';
import { log } from '../src/lib/server/log';
import type { NotamApiResponse } from '../src/types/notam';

async function main() {
  const { rawBlocks, fetchedAt, listed, failed } = await scrapeMobileNotams();

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
    // Single aggregate warn instead of per-block noise.
    log('warn', 'parser.null_blocks', { nullCount, samples: nullSamples });
  }

  for (const f of failed) {
    errors.push(`Detail fetch failed for ${f.notamId} (${f.rowID}): ${f.reason}`);
  }

  if (notams.length === 0 && listed > 0) {
    throw new Error(`Listed ${listed} NOTAMs but parsed zero blocks — refusing to overwrite KV`);
  }

  const payload: NotamApiResponse = {
    notams,
    fetchedAt,
    source: IAA_LIST_URL,
    count: notams.length,
    errors: errors.length > 0 ? errors : undefined,
  };

  await setLatestNotams(payload);

  console.log(
    `Scraped ${notams.length}/${listed} NOTAMs in ${fetchedAt}. Errors: ${errors.length}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
