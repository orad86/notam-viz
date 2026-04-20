import { NextResponse } from 'next/server';
import { getLatestNotams } from '@/lib/kv';
import { NotamApiResponse } from '@/types/notam';

export const runtime = 'nodejs';
export const revalidate = 3600;

const SOURCE_URL = 'https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx';

export async function GET() {
  try {
    const cached = await getLatestNotams();

    if (!cached) {
      return NextResponse.json(
        {
          notams: [],
          fetchedAt: new Date().toISOString(),
          source: SOURCE_URL,
          count: 0,
          errors: ['No cached NOTAMs in KV yet — run the scrape workflow'],
        } as NotamApiResponse,
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
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
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
