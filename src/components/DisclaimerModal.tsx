'use client';

import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/version';

interface Props {
  onAccept: () => void;
  onOpenLegal: (doc: 'terms' | 'privacy') => void;
}

export default function DisclaimerModal({ onAccept, onOpenLegal }: Props) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-paper-overlay px-3 py-4 md:py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Disclaimer"
    >
      <div className="neatline flex w-full max-w-md flex-col overflow-hidden rounded-md bg-paper-raised shadow-lg">
        <div className="shrink-0 border-b border-rule px-4 py-3">
          <h2 className="font-display text-base font-semibold text-ink">
            Disclaimer
          </h2>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-ink-2">
          <p>
            This tool visualizes NOTAMs for situational awareness only. It is{' '}
            <strong>not for operational flight planning</strong>.
          </p>
          <p>
            Data may be incomplete, delayed, or incorrectly parsed. Always
            consult official IAA sources before any flight.
          </p>
          <p>
            By continuing, you acknowledge our Terms of Use and Privacy Notice.
          </p>
        </div>
        <div className="safe-bottom flex shrink-0 items-center justify-between gap-2 border-t border-rule px-4 py-3">
          <span className="flex items-center gap-1 text-2xs text-ink-3">
            <span className="font-mono tabular-nums">v{APP_VERSION}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text"
            >
              Terms
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text"
            >
              Privacy
            </button>
          </span>
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex h-10 shrink-0 items-center rounded-sm bg-accent-strong px-5 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
