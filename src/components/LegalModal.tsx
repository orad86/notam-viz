'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { renderMarkdown } from '@/lib/render-markdown';

interface Props {
  title: string;
  body: string;
  onClose: () => void;
}

export default function LegalModal({ title, body, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-paper-overlay px-3 py-4 md:py-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-paper-raised rounded-md shadow-lg w-full max-w-2xl max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-4 py-3">
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="-me-1 inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {renderMarkdown(body)}
        </div>
      </div>
    </div>
  );
}
