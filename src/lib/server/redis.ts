import { Redis } from '@upstash/redis';

// One Upstash client per instance, shared by the rate limiter (Node route
// handler) and the usage counters (Edge middleware). `@upstash/redis` is
// fetch-based, so the same module works in both runtimes. Returns null when
// the env vars are missing, which keeps `next build` and local dev working
// without a Redis backend.
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
