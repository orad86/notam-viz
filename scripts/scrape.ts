import { scrapeMobileNotams } from '../src/lib/server/scraper-mobile';
import { buildPayload } from '../src/lib/server/publish';
import { setLatestNotams } from '../src/lib/server/kv';
import { IAA_LIST_URL } from '../src/lib/server/config';

async function main() {
  const { rawBlocks, fetchedAt, listed, failed } = await scrapeMobileNotams();

  const payload = buildPayload(rawBlocks, {
    fetchedAt,
    source: IAA_LIST_URL,
    extraErrors: failed.map(
      (f) => `Detail fetch failed for ${f.notamId} (${f.rowID}): ${f.reason}`,
    ),
  });

  if (payload.count === 0 && listed > 0) {
    throw new Error(`Listed ${listed} NOTAMs but parsed zero blocks — refusing to overwrite KV`);
  }

  await setLatestNotams(payload);

  console.log(
    `Scraped ${payload.count}/${listed} NOTAMs in ${fetchedAt}. Errors: ${payload.errors?.length ?? 0}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
