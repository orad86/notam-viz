'use server';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminConfig,
  credentialsMatch,
  signSession,
} from '@/lib/admin/session';
import {
  checkAdminLoginRateLimit,
  clientKeyFromHeaders,
  maskIpForLog,
} from '@/lib/server/rate-limit';
import { log } from '@/lib/server/log';

// Never log what was typed, only that an attempt happened and from roughly
// where (masked to /24 or /64).
export async function login(formData: FormData): Promise<void> {
  const cfg = adminConfig();
  if (!cfg) notFound();

  const key = clientKeyFromHeaders(headers());
  const rl = await checkAdminLoginRateLimit(key);
  if (!rl.allowed) {
    log('warn', 'admin.login.rate_limited', { key: maskIpForLog(key) });
    redirect('/admin/login?e=wait');
  }

  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!(await credentialsMatch(cfg, username, password))) {
    log('warn', 'admin.login.failed', { key: maskIpForLog(key) });
    redirect('/admin/login?e=bad');
  }

  cookies().set(ADMIN_COOKIE, await signSession(cfg.secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/admin',
    maxAge: ADMIN_SESSION_SECONDS,
  });
  log('info', 'admin.login.succeeded', { key: maskIpForLog(key) });
  redirect('/admin');
}

export async function logout(): Promise<void> {
  cookies().set(ADMIN_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/admin',
    maxAge: 0,
  });
  redirect('/admin/login');
}
