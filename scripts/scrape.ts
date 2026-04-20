import { scrapeMobileNotams } from '../src/lib/scraper-mobile';
import { parseNotamBlock } from '../src/lib/notam-parser';
import { setLatestNotams } from '../src/lib/kv';
import type { NotamApiResponse } from '../src/types/notam';

const SOURCE_URL = 'https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx';

async function main() {
  const { rawBlocks, fetchedAt, listed, failed } = await scrapeMobileNotams();

  const notams: NotamApiResponse['notams'] = [];
  const errors: string[] = [];

  for (const block of rawBlocks) {
    try {
      const parsed = parseNotamBlock(block);
      if (parsed) notams.push(parsed);
      else errors.push('Parser returned null for a block');
    } catch (error) {
      errors.push(
        `parseNotamBlock failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    source: SOURCE_URL,
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
