import { describe, it, expect } from 'vitest';
import {
  ADMIN_SESSION_SECONDS,
  adminConfig,
  credentialsMatch,
  signSession,
  verifySession,
} from '@/lib/admin/session';

// Throwaway values generated per run. The repo is public: never hardcode
// anything that looks like a real credential here.
const secret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const otherSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const cfg = { username: crypto.randomUUID(), password: crypto.randomUUID(), secret };
const now = Date.UTC(2026, 10, 3, 12);

describe('adminConfig', () => {
  const env = {
    ADMIN_USERNAME: cfg.username,
    ADMIN_PASSWORD: cfg.password,
    ADMIN_SESSION_SECRET: secret,
  };

  it('returns the config when all three are set', () => {
    expect(adminConfig(env)).toEqual(cfg);
  });

  it.each(['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET'])(
    'is disabled (null) when %s is missing',
    (name) => {
      expect(adminConfig({ ...env, [name]: undefined })).toBeNull();
      expect(adminConfig({ ...env, [name]: '' })).toBeNull();
    },
  );

  it('rejects a session secret shorter than 32 characters', () => {
    expect(adminConfig({ ...env, ADMIN_SESSION_SECRET: 'x'.repeat(31) })).toBeNull();
  });
});

describe('credentialsMatch', () => {
  it('accepts the configured pair', async () => {
    expect(await credentialsMatch(cfg, cfg.username, cfg.password)).toBe(true);
  });

  it.each([
    ['wrong password', () => [cfg.username, `${cfg.password}x`]],
    ['wrong username', () => [`${cfg.username}x`, cfg.password]],
    ['swapped fields', () => [cfg.password, cfg.username]],
    ['empty input', () => ['', '']],
  ])('rejects %s', async (_name, input) => {
    const [u, p] = input();
    expect(await credentialsMatch(cfg, u, p)).toBe(false);
  });
});

describe('session cookie', () => {
  it('verifies a freshly signed session', async () => {
    const value = await signSession(secret, now);
    expect(await verifySession(value, secret, now + 1000)).toBe(true);
  });

  it('expires after the session lifetime', async () => {
    const value = await signSession(secret, now);
    expect(await verifySession(value, secret, now + ADMIN_SESSION_SECONDS * 1000 - 1000)).toBe(true);
    expect(await verifySession(value, secret, now + ADMIN_SESSION_SECONDS * 1000)).toBe(false);
  });

  it('rejects a session signed with a different secret', async () => {
    const value = await signSession(otherSecret, now);
    expect(await verifySession(value, secret, now)).toBe(false);
  });

  it('rejects an extended expiry with the original signature', async () => {
    const [exp, sig] = (await signSession(secret, now)).split('.');
    expect(await verifySession(`${Number(exp) + 86400}.${sig}`, secret, now)).toBe(false);
  });

  it('rejects a tampered signature', async () => {
    const value = await signSession(secret, now);
    const flipped = value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');
    expect(await verifySession(flipped, secret, now)).toBe(false);
  });

  it.each([undefined, '', 'abc', '123', '123.', '.abc', 'x.y', '1.2.3'])(
    'rejects malformed value %j',
    async (value) => {
      expect(await verifySession(value, secret, now)).toBe(false);
    },
  );
});
