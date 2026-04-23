'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ParsedNotam } from '@/types/notam';
import { getCategoryColor } from '@/lib/notam-format';
import { APP_VERSION } from '@/lib/version';

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
          className="md:hidden fixed inset-x-0 bottom-0 top-12 bg-black/30 z-[9000]"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        style={{ height: 'calc(100dvh - 3rem)' }}
        className={`bg-white border-r border-gray-200 flex flex-col
          fixed z-[9999] left-0 top-12
          w-[85%] max-w-sm md:w-80 md:max-w-none
          shadow-xl md:shadow-none
          transform transition-transform duration-200
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {routeInput}
        {filterBar}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-xs">
            <span className="font-semibold text-blue-800 tabular-nums">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={onClear}
              className="text-blue-700 hover:underline ml-auto"
            >
              Clear
            </button>
          </div>
        )}

        {routeBanner}
        {focusedHiddenHint}

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="divide-y divide-gray-100">
            {totalCount === 0 ? (
              <div className="text-xs text-gray-500 text-center py-6">
                No NOTAMs loaded
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-6">
                No NOTAMs match current filters
              </div>
            ) : (
              filtered.map((notam) => {
                const isMember = selectedIds.has(notam.id);
                const isFocused = selectedNotam?.id === notam.id;
                const dotColor = getCategoryColor(notam.category);
                return (
                  <div
                    key={notam.id}
                    ref={(el) => {
                      rowRefs.current.set(notam.id, el);
                    }}
                    className={`relative flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      isFocused
                        ? 'bg-blue-100'
                        : isMember
                          ? 'bg-blue-50'
                          : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      onSelectNotam(notam);
                      onClose();
                    }}
                  >
                    {isFocused && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={isMember}
                      onChange={() => onToggleSelect(notam.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-blue-600 shrink-0"
                      aria-label={`Select ${notam.notamId}`}
                    />
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                      title={notam.category}
                    />
                    <span className="font-mono font-semibold text-[11px] text-gray-900 shrink-0">
                      {notam.id}
                    </span>
                    {notam.isActive && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"
                        title="Active"
                        aria-label="Active"
                      />
                    )}
                    <span className="text-[11px] text-gray-600 truncate flex-1 min-w-0">
                      {notam.title}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500 flex items-center justify-between gap-2 safe-bottom">
          <span className="tabular-nums">v{APP_VERSION}</span>
          <span className="flex items-center gap-2">
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
        </div>
      </aside>
    </>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
