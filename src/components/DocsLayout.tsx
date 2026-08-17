import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_VERSION } from '@/lib/version';

interface Props {
  title: string;
  children: ReactNode;
}

const FOOTER_LINK =
  'rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text';

export default function DocsLayout({ title, children }: Props) {
  return (
    <div
      className="bg-paper text-ink"
      style={{ height: '100dvh', overflowY: 'auto' }}
    >
      <header className="safe-top sticky top-0 z-10 border-b border-rule bg-paper-raised">
        <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-4">
          <Link
            href="/"
            className="font-display text-base font-semibold tracking-tight text-ink transition-colors hover:text-accent-text"
          >
            NOTAM Visualizer
          </Link>
          <span className="text-ink-3" aria-hidden>
            /
          </span>
          <span className="truncate text-sm text-ink-3">{title}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 md:py-10">
        <h1 className="mb-3 font-display text-2xl font-semibold text-ink">
          {title}
        </h1>
        {children}
      </main>

      <footer className="safe-bottom mx-auto flex max-w-2xl items-center gap-1 px-4 pb-10 pt-6 text-2xs text-ink-3">
        <span className="me-1 font-mono tabular-nums">v{APP_VERSION}</span>
        <Link href="/" className={FOOTER_LINK}>
          App
        </Link>
        <Link href="/support" className={FOOTER_LINK}>
          Support
        </Link>
        <Link href="/terms" className={FOOTER_LINK}>
          Terms
        </Link>
        <Link href="/privacy" className={FOOTER_LINK}>
          Privacy
        </Link>
      </footer>
    </div>
  );
}
