import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { classifyPlatform, normalizeCity } from '@/lib/analytics/classify';
import { recordLaunch } from '@/lib/analytics/store';
import { ADMIN_COOKIE, adminConfig, verifySession } from '@/lib/admin/session';
import { getRedis } from '@/lib/server/redis';
import { log } from '@/lib/server/log';

// Two jobs, both of which have to run here rather than in a route:
//
// 1. Count launches. On Vercel, middleware runs BEFORE the CDN cache, and
//    /api/notams is served from that cache (s-maxage=3600) for most requests,
//    so the route handler never sees them. Counting happens in waitUntil, after
//    the response has been handed back, and can never fail the request.
//
// 2. Gate /admin. The page re-checks the session itself; this is the outer
//    door, and the 404 when the admin env vars are not set.
//
// The native static export cannot contain middleware: scripts/native-build.mjs
// moves this file aside for that build.

export const config = {
  matcher: ['/api/notams', '/admin/:path*'],
};

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow' };

// Production only, so preview deployments and local runs do not pollute the
// counters. STATS_RECORD=1 opts a local `next start` in for verification.
function recordingEnabled(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.STATS_RECORD === '1';
}

let lastFailureLogAt = 0;

async function countLaunch(req: NextRequest): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    const platform = classifyPlatform(req.headers.get('origin'), req.headers.get('user-agent'));
    await recordLaunch(redis, platform, normalizeCity(req.geo?.city));
  } catch (err) {
    const now = Date.now();
    if (now - lastFailureLogAt >= 60_000) {
      lastFailureLogAt = now;
      log('warn', 'analytics.record.failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function gateAdmin(req: NextRequest): Promise<NextResponse> {
  const cfg = adminConfig();
  if (!cfg) return new NextResponse('Not Found', { status: 404, headers: NOINDEX });

  if (req.nextUrl.pathname !== '/admin/login') {
    const ok = await verifySession(req.cookies.get(ADMIN_COOKIE)?.value, cfg.secret);
    if (!ok) {
      const res = NextResponse.redirect(new URL('/admin/login', req.url));
      res.headers.set('X-Robots-Tag', NOINDEX['X-Robots-Tag']);
      return res;
    }
  }
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', NOINDEX['X-Robots-Tag']);
  return res;
}

export async function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (req.nextUrl.pathname === '/api/notams') {
    if (req.method === 'GET' && recordingEnabled()) ev.waitUntil(countLaunch(req));
    return NextResponse.next();
  }
  return gateAdmin(req);
}
