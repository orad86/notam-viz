import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { ADMIN_COOKIE, adminConfig, verifySession } from '@/lib/admin/session';
import { login } from '../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  bad: 'Wrong username or password.',
  wait: 'Too many attempts. Wait a minute and try again.',
};

const FIELD =
  'w-full rounded-sm border border-rule-strong bg-paper-raised px-3 py-2 text-sm text-ink transition-colors hover:border-ink-3';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { e?: string };
}) {
  const cfg = adminConfig();
  if (!cfg) notFound();
  if (await verifySession(cookies().get(ADMIN_COOKIE)?.value, cfg.secret)) redirect('/admin');

  const error = searchParams.e ? ERRORS[searchParams.e] : undefined;

  return (
    <main className="safe-top flex min-h-full items-center justify-center px-4 py-12">
      <form
        action={login}
        className="neatline w-full max-w-sm space-y-4 rounded-md bg-paper-raised p-6 shadow-md"
      >
        <div>
          <p className="plate-label">NOTAM Visualizer</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Usage</h1>
        </div>

        {error && (
          <p role="alert" className="rounded-sm bg-danger-wash px-3 py-2 text-xs text-ink">
            {error}
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-2">Username</span>
          <input name="username" autoComplete="username" required className={FIELD} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-2">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={FIELD}
          />
        </label>

        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold text-ink-inverse transition-colors hover:bg-accent-strong"
        >
          <LogIn className="size-4" aria-hidden />
          Sign in
        </button>
      </form>
    </main>
  );
}
