// Admin authentication. Web Crypto only, so the same code runs in the Edge
// middleware and in Node server components / actions.
//
// The repo is public, so the credentials exist ONLY as environment variables
// (Vercel "Sensitive" vars in production, .env.local locally). There is no
// default and no fallback: if any of the three is missing, adminConfig()
// returns null and every /admin path answers 404.

export const ADMIN_COOKIE = 'nv_admin';
export const ADMIN_SESSION_SECONDS = 8 * 3600;
const MIN_SECRET_LENGTH = 32;

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}

export function adminConfig(
  env: Record<string, string | undefined> = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  },
): AdminConfig | null {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;
  const secret = env.ADMIN_SESSION_SECRET;
  if (!username || !password || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  return { username, password, secret };
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

// Compares two equal-length hex digests without an early exit. Callers only
// ever pass digests, so the length check leaks nothing about the input.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function credentialsMatch(
  cfg: AdminConfig,
  username: string,
  password: string,
): Promise<boolean> {
  // Hash all four so the comparison time does not depend on the input length,
  // and evaluate both comparisons so a right username is not distinguishable.
  const [u1, u2, p1, p2] = await Promise.all([
    sha256Hex(username),
    sha256Hex(cfg.username),
    sha256Hex(password),
    sha256Hex(cfg.password),
  ]);
  const userOk = constantTimeEqual(u1, u2);
  const passOk = constantTimeEqual(p1, p2);
  return userOk && passOk;
}

// Session cookie value: `{expiryEpochSeconds}.{hex HMAC-SHA256}`. Stateless:
// logging out clears the browser's copy; rotating ADMIN_SESSION_SECRET
// invalidates every outstanding session.
export async function signSession(secret: string, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + ADMIN_SESSION_SECONDS;
  return `${exp}.${await hmacHex(secret, `nv-admin:${exp}`)}`;
}

export async function verifySession(
  value: string | undefined,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [expStr, sig] = parts;
  if (!/^\d{1,12}$/.test(expStr)) return false;
  if (Number(expStr) * 1000 <= nowMs) return false;
  return constantTimeEqual(sig, await hmacHex(secret, `nv-admin:${expStr}`));
}
