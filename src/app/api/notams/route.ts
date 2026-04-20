import { NextResponse } from 'next/server';
import { scrapeMobileNotams } from '@/lib/scraper-mobile';
import { parseNotamBlock } from '@/lib/notam-parser';
import { NotamApiResponse } from '@/types/notam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_URL = 'https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx';

export async function GET() {
  try {
    const { rawBlocks, fetchedAt, listed, failed } = await scrapeMobileNotams();
    const errors: string[] = [];
    const notams = [];

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
      errors.push(`Listed ${listed} NOTAMs but parsed zero blocks`);
    }

    const response: NotamApiResponse = {
      notams,
      fetchedAt,
      source: SOURCE_URL,
      count: notams.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        notams: [],
        fetchedAt: new Date().toISOString(),
        source: SOURCE_URL,
        count: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      } as NotamApiResponse,
      { status: 500, headers: { 'Cache-Control': 'no-cache' } },
    );
  }
}
