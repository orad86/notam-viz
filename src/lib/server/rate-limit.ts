import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { NextRequest } from 'next/server';
import { log } from './log';

// Sliding window of 30 requests / minute per client key. The public NOTAM
// snapshot is 1 KV fetch + JSON, but unrate-limited scraping still heats up
// regional caches and bypasses the CDN. 30/min leaves plenty of headroom for
// a genuine interactive session while blocking basic crawlers.
const LIMIT = 30;
const WINDOW: Parameters<typeof Ratelimit.slidingWindow>[1] = '1 m';
const FALLBACK_RESET_MS = 60_000;

// Initialized once at module scope (Fluid Compute reuses the instance across
// warm requests). Falls back to a no-op if env vars are missing — this keeps
// `next build` and local dev workable without a rate-limit backend.
let limiter: Ratelimit | null = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    analytics: false,
    prefix: 'ratelimit:notams',
  });
}

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
  const ip = req.ip;
  if (ip) return ip;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
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
