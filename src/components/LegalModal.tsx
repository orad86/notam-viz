'use client';

import { useEffect } from 'react';

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] && match[3]) {
      parts.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          {match[2]}
        </a>,
      );
    } else if (match[4]) {
      parts.push(
        <code key={key++} className="font-mono text-[12px] bg-gray-100 px-1 rounded">
          {match[4]}
        </code>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(
      <p key={key++} className="my-3 text-sm leading-relaxed text-gray-800">
        {renderInline(paragraph.join(' '))}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    out.push(
      <ul key={key++} className="my-3 ml-5 list-disc text-sm text-gray-800 space-y-1">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('#### ')) {
      flushParagraph();
      flushList();
      out.push(
        <h4 key={key++} className="mt-5 mb-2 text-sm font-semibold text-gray-900">
          {renderInline(line.slice(5))}
        </h4>,
      );
    } else if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      out.push(
        <h3 key={key++} className="mt-5 mb-2 text-[15px] font-semibold text-gray-900">
          {renderInline(line.slice(4))}
        </h3>,
      );
    } else if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      out.push(
        <h2 key={key++} className="mt-6 mb-2 text-base font-bold text-gray-900">
          {renderInline(line.slice(3))}
        </h2>,
      );
    } else if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      // The title shows in the modal header; skip the leading H1 in the body.
    } else if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2));
    } else if (line === '---') {
      flushParagraph();
      flushList();
      out.push(<hr key={key++} className="my-5 border-gray-200" />);
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return out;
}

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
