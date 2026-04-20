import { NextRequest, NextResponse } from 'next/server';
import { getLatestNotams } from '@/lib/kv';
import {
  IAA_LIST_URL,
  CACHE_MAX_AGE_SECONDS,
  CACHE_STALE_SECONDS,
} from '@/lib/config';
import { log } from '@/lib/log';
import { checkRateLimit, clientKeyFromRequest, maskIpForLog } from '@/lib/rate-limit';
import { NotamApiResponse } from '@/types/notam';

export const runtime = 'nodejs';
// No `revalidate` export: reading request headers for rate-limiting forces this
// route to be dynamic, which makes ISR inert. All CDN caching is driven by the
// `Cache-Control` header below; see docs/OPERATIONS.md §Runtime model.

const CACHE_HEADER = `public, s-maxage=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_SECONDS}`;

export async function GET(req: NextRequest) {
  const start = Date.now();

  const key = clientKeyFromRequest(req);
  const rl = await checkRateLimit(key);
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    log('warn', 'api.notams.rate_limited', {
      key: maskIpForLog(key),
      retryAfterSec,
    });
    return NextResponse.json(
      {
        notams: [],
        fetchedAt: new Date().toISOString(),
        source: IAA_LIST_URL,
        count: 0,
        errors: [`Rate limit exceeded. Retry in ${retryAfterSec}s.`],
      } as NotamApiResponse,
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
        },
      },
    );
  }

  try {
    const cached = await getLatestNotams();

    if (!cached) {
      log('warn', 'api.notams.empty_kv', { durationMs: Date.now() - start });
      return NextResponse.json(
        {
          notams: [],
          fetchedAt: new Date().toISOString(),
          source: IAA_LIST_URL,
          count: 0,
          errors: ['No cached NOTAMs in KV yet — run the scrape workflow'],
        } as NotamApiResponse,
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    log('info', 'api.notams.served', {
      count: cached.count,
      durationMs: Date.now() - start,
    });
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': CACHE_HEADER },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', 'api.notams.error', {
      message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json(
      {
        notams: [],
        fetchedAt: new Date().toISOString(),
        source: IAA_LIST_URL,
        count: 0,
        errors: [message],
      } as NotamApiResponse,
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
