import { Ratelimit } from '@upstash/ratelimit';
import type { NextRequest } from 'next/server';
import { log } from './log';
import { getRedis } from './redis';

// Sliding window of 30 requests / minute per client key. The public NOTAM
// snapshot is 1 KV fetch + JSON, but unrate-limited scraping still heats up
// regional caches and bypasses the CDN. 30/min leaves plenty of headroom for
// a genuine interactive session while blocking basic crawlers.
const LIMIT = 30;
const WINDOW: Parameters<typeof Ratelimit.slidingWindow>[1] = '1 m';
const FALLBACK_RESET_MS = 60_000;

// Admin login attempts: 5 / minute per client key. Brute-forcing the admin
// password is the one thing this limiter exists to stop, so unlike the NOTAM
// limiter it fails CLOSED when Upstash is unreachable.
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOGIN_WINDOW: Parameters<typeof Ratelimit.slidingWindow>[1] = '1 m';

// Initialized once at module scope (Fluid Compute reuses the instance across
// warm requests). Falls back to a no-op if env vars are missing — this keeps
// `next build` and local dev workable without a rate-limit backend.
function makeLimiter(
  limit: number,
  window: Parameters<typeof Ratelimit.slidingWindow>[1],
  prefix: string,
): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix,
  });
}

const limiter = makeLimiter(LIMIT, WINDOW, 'ratelimit:notams');
const adminLoginLimiter = makeLimiter(
  ADMIN_LOGIN_LIMIT,
  ADMIN_LOGIN_WINDOW,
  'ratelimit:admin',
);

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

// Log throttle for `ratelimit.unavailable` — a sustained Upstash outage would
// otherwise flood stderr with one warn per request.
let lastUnavailableLogAt = 0;
const UNAVAILABLE_LOG_INTERVAL_MS = 60_000;

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const fallbackResetAt = Date.now() + FALLBACK_RESET_MS;
  if (!limiter) {
    return { allowed: true, limit: LIMIT, remaining: LIMIT, resetAt: fallbackResetAt };
  }
  try {
    const { success, limit, remaining, reset } = await limiter.limit(key);
    return { allowed: success, limit, remaining, resetAt: reset };
  } catch (err) {
    // If Upstash is unreachable, fail open — better to serve stale NOTAMs
    // than to 500 every request. Log at most once per minute per instance.
    const now = Date.now();
    if (now - lastUnavailableLogAt >= UNAVAILABLE_LOG_INTERVAL_MS) {
      lastUnavailableLogAt = now;
      log('warn', 'ratelimit.unavailable', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { allowed: true, limit: LIMIT, remaining: LIMIT, resetAt: fallbackResetAt };
  }
}

export async function checkAdminLoginRateLimit(key: string): Promise<RateLimitResult> {
  const resetAt = Date.now() + FALLBACK_RESET_MS;
  // No backend configured (local dev): nothing to enforce against.
  if (!adminLoginLimiter) {
    return { allowed: true, limit: ADMIN_LOGIN_LIMIT, remaining: ADMIN_LOGIN_LIMIT, resetAt };
  }
  try {
    const { success, limit, remaining, reset } = await adminLoginLimiter.limit(key);
    return { allowed: success, limit, remaining, resetAt: reset };
  } catch (err) {
    log('warn', 'ratelimit.unavailable', {
      limiter: 'admin',
      message: err instanceof Error ? err.message : String(err),
    });
    return { allowed: false, limit: ADMIN_LOGIN_LIMIT, remaining: 0, resetAt };
  }
}

// Derive a per-IP rate-limit key from the request. Priority:
//   1. `request.ip` — populated by Vercel from the verified TCP peer; cannot
//      be spoofed by the client.
//   2. `x-forwarded-for` — trusted only when the app is behind a proxy that
//      sets it (Vercel does). Takes the first entry.
//   3. `x-real-ip` — some reverse proxies.
//   4. `'anon'` — no identity available; falls into a single shared bucket.
// In a self-hosted deployment *not* behind a trusted proxy, `x-forwarded-for`
// is client-controllable and should not be trusted; callers in that posture
// must strip the header before it reaches the app.
export function clientKeyFromRequest(req: NextRequest): string {
  return req.ip || clientKeyFromHeaders(req.headers);
}

// Same priority list minus `request.ip`, for callers that only have headers
// (server actions, via `headers()` from next/headers).
export function clientKeyFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'anon';
}

// Truncate an IP to /24 (IPv4) or /64 (IPv6) for log emission. Rate-limit
// bucketing stays per-IP; only the log field is masked, keeping operational
// signal while trimming the PII retention profile.
export function maskIpForLog(key: string): string {
  if (key === 'anon') return 'anon';
  if (key.includes(':')) {
    const groups = key.split(':');
    return groups.slice(0, 4).join(':') + '::/64';
  }
  const parts = key.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return key;
}
