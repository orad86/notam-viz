import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_VERSION } from '@/lib/version';

interface Props {
  title: string;
  children: ReactNode;
}

export default function DocsLayout({ title, children }: Props) {
  return (
    <div
      className="bg-white text-gray-900"
      style={{ height: '100dvh', overflowY: 'auto' }}
    >
      <header className="sticky top-0 z-10 h-12 border-b border-gray-200 flex items-center px-3 md:px-6 bg-gradient-to-r from-blue-600 to-blue-700 gap-3">
        <Link
          href="/"
          className="text-white text-base md:text-lg font-bold hover:underline"
        >
          NOTAM Visualizer
        </Link>
        <span className="text-white/80 text-sm">/ {title}</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 md:py-10">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h1>
        {children}
      </main>

      <footer className="max-w-2xl mx-auto px-4 pt-6 pb-10 text-[11px] text-gray-500 flex items-center gap-2 safe-bottom">
        <span className="tabular-nums">v{APP_VERSION}</span>
        <span aria-hidden>·</span>
        <Link href="/" className="hover:text-blue-600 hover:underline">
          App
        </Link>
        <span aria-hidden>·</span>
        <Link href="/support" className="hover:text-blue-600 hover:underline">
          Support
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="hover:text-blue-600 hover:underline">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="hover:text-blue-600 hover:underline">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
