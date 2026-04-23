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
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/50 backdrop-blur-sm px-3 py-4 md:py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Disclaimer"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">Disclaimer</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm leading-relaxed text-gray-800">
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
        <div className="shrink-0 px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2 safe-bottom">
          <span className="text-[11px] text-gray-500 flex items-center gap-2">
            <span className="tabular-nums">v{APP_VERSION}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="hover:text-blue-600 hover:underline"
            >
              Terms
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="hover:text-blue-600 hover:underline"
            >
              Privacy
            </button>
          </span>
          <button
            type="button"
            onClick={onAccept}
            className="px-4 py-1.5 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
