import type { ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
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

export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
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
      // The H1 typically duplicates the page title; skip it when rendering body.
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
