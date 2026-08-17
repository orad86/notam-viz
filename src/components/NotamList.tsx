'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ParsedNotam } from '@/types/notam';
import { decodeNotam } from '@/lib/notam/decode';
import { APP_VERSION } from '@/lib/version';
import { cn } from '@/lib/cn';

interface NotamListProps {
  filtered: ParsedNotam[];
  totalCount: number;
  onSelectNotam: (notam: ParsedNotam) => void;
  selectedNotam: ParsedNotam | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
  filterBar: React.ReactNode;
  routeInput?: React.ReactNode;
  routeBanner?: React.ReactNode;
  focusedHiddenHint?: React.ReactNode;
  onOpenLegal: (doc: 'terms' | 'privacy') => void;
}

interface RowProps {
  notam: ParsedNotam;
  isMember: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onToggle: () => void;
  rowRef: (el: HTMLDivElement | null) => void;
}

function Row({ notam, isMember, isFocused, onSelect, onToggle, rowRef }: RowProps) {
  // The old row showed `notam.title`, which is the two-letter Q subject glued to
  // the first 80 raw characters ("MR RWY 12/30 CLSD DUE TO WIP FROM..."). The
  // decoded headline says the same thing in words.
  const decoded = useMemo(() => decodeNotam(notam), [notam]);

  return (
    <div
      ref={rowRef}
      className={cn(
        'relative flex cursor-pointer items-start gap-2.5 border-b border-rule px-3 py-2.5 transition-colors',
        isFocused ? 'bg-accent-wash' : 'hover:bg-paper-sunk',
      )}
      onClick={onSelect}
    >
      {isFocused && (
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 w-0.5 bg-accent"
        />
      )}

      <input
        type="checkbox"
        checked={isMember}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 size-4 shrink-0 accent-[--accent-strong]"
        aria-label={`Select ${notam.notamId}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-2xs font-medium text-ink-2">
            {notam.notamId}
          </span>
          {notam.isActive && (
            <span
              className="size-1.5 shrink-0 rounded-pill bg-ok"
              title="Active"
              aria-label="Active"
            />
          )}
          <span className="ms-auto shrink-0 font-mono text-2xs text-ink-3 tabular-nums">
            {decoded.when.isPerm ? 'PERM' : decoded.when.to.slice(0, 10)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink">
          {decoded.headline}
        </p>
      </div>
    </div>
  );
}

export default function NotamList({
  filtered,
  totalCount,
  onSelectNotam,
  selectedNotam,
  selectedIds,
  onToggleSelect,
  onClear,
  isOpen,
  onClose,
  filterBar,
  routeInput,
  routeBanner,
  focusedHiddenHint,
  onOpenLegal,
}: NotamListProps) {
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedNotam) return;
    const el = rowRefs.current.get(selectedNotam.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedNotam]);

  const content = (
    <>
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-[9000] bg-paper-overlay md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        // dvh tracks the mobile browser chrome collapsing; vh does not.
        style={{ height: 'calc(100dvh - 3rem)' }}
        className={cn(
          'fixed start-0 top-12 z-[9999] flex w-[85%] max-w-sm flex-col',
          'border-e border-rule bg-paper-raised shadow-lg',
          'transform transition-transform duration-200 ease-out',
          'md:w-80 md:max-w-none md:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {routeInput}
        {filterBar}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 border-b border-accent/30 bg-accent-wash px-3 py-2">
            <span className="font-mono text-2xs font-medium text-accent-text tabular-nums">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={onClear}
              className="ms-auto rounded-xs px-2 py-1 text-2xs font-medium text-accent-text transition-colors hover:bg-paper-raised"
            >
              Clear
            </button>
          </div>
        )}

        {routeBanner}
        {focusedHiddenHint}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hairline">
          {totalCount === 0 ? (
            <p className="px-6 py-10 text-center text-xs text-ink-3">
              No NOTAMs loaded.
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="font-display text-sm text-ink">Nothing matches</p>
              <p className="text-xs text-ink-3">
                No NOTAMs match the current filters.
              </p>
            </div>
          ) : (
            filtered.map((notam) => (
              <Row
                key={notam.id}
                notam={notam}
                isMember={selectedIds.has(notam.id)}
                isFocused={selectedNotam?.id === notam.id}
                onSelect={() => {
                  onSelectNotam(notam);
                  onClose();
                }}
                onToggle={() => onToggleSelect(notam.id)}
                rowRef={(el) => {
                  rowRefs.current.set(notam.id, el);
                }}
              />
            ))
          )}
        </div>

        <div className="safe-bottom flex shrink-0 items-center justify-between gap-2 border-t border-rule px-3 py-2">
          <span className="font-mono text-2xs text-ink-3 tabular-nums">
            v{APP_VERSION}
          </span>
          <span className="flex items-center gap-1 text-2xs text-ink-3">
            <a
              href="/support"
              target="_blank"
              rel="noreferrer"
              className="rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text"
            >
              Support
            </a>
            <button
              type="button"
              onClick={() => onOpenLegal('terms')}
              className="rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onOpenLegal('privacy')}
              className="rounded-xs px-1.5 py-1 transition-colors hover:text-accent-text"
            >
              Privacy
            </button>
          </span>
        </div>
      </aside>
    </>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
