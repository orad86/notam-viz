import { NextRequest, NextResponse } from 'next/server';
import { getLatestNotams } from '@/lib/server/kv';
import {
  IAA_LIST_URL,
  CACHE_MAX_AGE_SECONDS,
  CACHE_STALE_SECONDS,
} from '@/lib/server/config';
import { log } from '@/lib/server/log';
import { checkRateLimit, clientKeyFromRequest, maskIpForLog } from '@/lib/server/rate-limit';
import { NotamApiResponse } from '@/types/notam';

export const runtime = 'nodejs';
// No `revalidate` export: reading request headers for rate-limiting forces this
// route to be dynamic, which makes ISR inert. All CDN caching is driven by the
// `Cache-Control` header below; see docs/OPERATIONS.md §Runtime model.

const CACHE_HEADER = `public, s-maxage=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_STALE_SECONDS}`;

// Allow cross-origin reads so the Capacitor iOS shell (origin
// `capacitor://localhost`) and any embedders can fetch the public NOTAM feed.
// The endpoint is read-only GET with no cookies or auth, so `*` is safe.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

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
          ...CORS_HEADERS,
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
        { status: 503, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
      );
    }

    log('info', 'api.notams.served', {
      count: cached.count,
      durationMs: Date.now() - start,
    });
    return NextResponse.json(cached, {
      headers: { ...CORS_HEADERS, 'Cache-Control': CACHE_HEADER },
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
      { status: 500, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } },
    );
  }
}
