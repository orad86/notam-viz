import { readFileSync } from 'node:fs';
import { extractManualBlocks, validateManualExtract } from '../src/lib/server/manual-import';
import { buildPayload } from '../src/lib/server/publish';
import { setLatestNotams } from '../src/lib/server/kv';
import { IAA_NOTAMS_URL } from '../src/lib/server/config';
import { log } from '../src/lib/server/log';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    throw new Error('Usage: npm run import:manual -- <copied-notams.txt> [--dry-run]');
  }

  // parseNotamDate builds B)/C) times with the local-time Date constructor;
  // they are UTC, so any other zone shifts every NOTAM. The cron runs in UTC.
  if (new Date().getTimezoneOffset() !== 0) {
    throw new Error('Run with TZ=UTC (npm run import:manual sets it).');
  }

  const extract = extractManualBlocks(readFileSync(file, 'utf8'));
  const problems = validateManualExtract(extract);
  if (problems.length > 0) {
    throw new Error(`Refusing to publish:\n- ${problems.join('\n- ')}`);
  }

  const payload = buildPayload(extract.blocks, {
    fetchedAt: new Date().toISOString(),
    source: IAA_NOTAMS_URL,
  });
  if (payload.count !== extract.blocks.length) {
    throw new Error(
      `Parsed ${payload.count} of ${extract.blocks.length} blocks — refusing to publish a partial snapshot`,
    );
  }

  const byCategory: Record<string, number> = {};
  for (const n of payload.notams) byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;
  const noGeometry = payload.notams.filter((n) => !n.geometry).map((n) => n.notamId);
  const active = payload.notams.filter((n) => n.isActive).length;

  console.log(`Parsed ${payload.count} NOTAMs (${active} active now).`);
  console.log('By category:', byCategory);
  if (noGeometry.length > 0) console.log('No geometry:', noGeometry.join(', '));

  if (dryRun) {
    console.log('Dry run: KV not written.');
    return;
  }

  await setLatestNotams(payload);
  log('info', 'import.manual.published', { count: payload.count, active });
  console.log(`Published ${payload.count} NOTAMs to KV at ${payload.fetchedAt}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
