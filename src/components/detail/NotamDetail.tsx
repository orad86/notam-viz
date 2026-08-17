'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Code2, Plus } from 'lucide-react';
import { ParsedNotam } from '@/types/notam';
import { decodeNotam, type DecodedToken } from '@/lib/notam/decode';
import { cn } from '@/lib/cn';

interface Props {
  notam: ParsedNotam;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

/**
 * The E-item, with recognised ICAO contractions marked up.
 *
 * The original token is always what is rendered; the expansion rides along in
 * `title` and a dotted underline. A NOTAM is an operational document — a pilot
 * cross-checking against the official source has to see the same words the
 * authority published, so nothing here rewrites the text.
 */
function DecodedBody({ tokens }: { tokens: DecodedToken[] }) {
  if (tokens.length === 0) {
    return <p className="text-xs text-ink-3">No text supplied.</p>;
  }

  return (
    <p className="whitespace-pre-line font-mono text-xs leading-relaxed text-ink">
      {tokens.map((token, i) =>
        token.kind === 'text' ? (
          <span key={i}>{token.text}</span>
        ) : (
          <abbr
            key={i}
            title={token.expanded}
            className="cursor-help decoration-accent/60 underline decoration-dotted underline-offset-2"
          >
            {token.raw}
          </abbr>
        ),
      )}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="plate-label shrink-0">{label}</dt>
      <dd className="text-end font-mono text-xs text-ink tabular-nums">{value}</dd>
    </div>
  );
}

export default function NotamDetail({ notam, isSelected, onToggleSelect }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const decoded = useMemo(() => decodeNotam(notam), [notam]);

  return (
    <div className="px-4 pb-6">
      {/* 1. Identity */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <span className="font-mono text-2xs font-medium text-ink-2">
          {notam.notamId}
        </span>
        <span className="inline-flex items-center gap-1 rounded-xs border border-rule-strong bg-paper-sunk px-1.5 py-0.5 text-2xs font-medium capitalize text-ink-2">
          {notam.category}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-2xs font-medium',
            notam.isActive
              ? 'border-ok/30 bg-ok-wash text-ok'
              : 'border-rule-strong bg-paper-sunk text-ink-3',
          )}
        >
          {notam.isActive ? 'Active' : 'Not active'}
        </span>
      </div>

      {/* 2. Plain language first — this is the headline act of the sheet. */}
      <h2 className="font-display text-lg leading-tight text-ink">
        {decoded.headline}
      </h2>

      {/* 3. The operational facts, as a scannable table. */}
      <dl className="mt-3 divide-y divide-rule border-y border-rule">
        <Row label="From" value={decoded.when.from} />
        <Row label="Until" value={decoded.when.to} />
        {decoded.when.schedule && (
          <Row label="Schedule" value={decoded.when.schedule} />
        )}
        {decoded.altitude && <Row label="Altitude" value={decoded.altitude} />}
        {decoded.scope && <Row label="Scope" value={decoded.scope} />}
        {decoded.traffic && <Row label="Traffic" value={decoded.traffic} />}
        {notam.qCode && <Row label="Q-code" value={notam.qCode} />}
      </dl>

      {/* 4. Decoded body */}
      <div className="mt-4">
        <span className="plate-label">Notice</span>
        <div className="mt-1.5 rounded-sm border border-rule bg-paper-sunk p-3">
          <DecodedBody tokens={decoded.body} />
        </div>
        <p className="mt-1.5 text-2xs text-ink-3">
          Underlined terms are ICAO contractions — hover or tap for the full word.
        </p>
      </div>

      {/* 5. Selection, reachable by touch (the map's modifier-click is not). */}
      <button
        type="button"
        onClick={() => onToggleSelect(notam.id)}
        className={cn(
          'mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-sm border text-sm font-medium transition-colors',
          isSelected
            ? 'border-accent/30 bg-accent-wash text-accent-text'
            : 'border-rule-strong bg-paper-raised text-ink hover:bg-paper-sunk',
        )}
      >
        {isSelected ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        {isSelected ? 'In export selection' : 'Add to export selection'}
      </button>

      {/* 6. Raw last, collapsed. */}
      <div className="mt-4 border-t border-rule pt-3">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="flex min-h-9 w-full items-center gap-2 rounded-sm text-ink-3 transition-colors hover:text-ink"
        >
          <Code2 className="size-3.5 shrink-0" aria-hidden />
          <span className="plate-label">Raw NOTAM</span>
          <ChevronDown
            className={cn(
              'ms-auto size-3.5 transition-transform',
              showRaw && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {showRaw && (
          <pre className="mt-2 overflow-x-auto rounded-sm border border-rule bg-paper-sunk p-3 font-mono text-2xs leading-relaxed text-ink-2">
            {notam.rawText}
          </pre>
        )}
      </div>
    </div>
  );
}
