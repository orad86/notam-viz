'use client';

import { useEffect } from 'react';
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
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-4 md:py-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {renderMarkdown(body)}
        </div>
      </div>
    </div>
  );
}
