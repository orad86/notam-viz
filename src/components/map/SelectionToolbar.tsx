'use client';

import { X } from 'lucide-react';

interface Props {
  selectedCount: number;
  onClear: () => void;
}

export default function SelectionToolbar({ selectedCount, onClear }: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="absolute start-1/2 top-3 z-[1050] -translate-x-1/2 rounded-md border border-rule bg-paper-raised shadow-md md:start-3 md:translate-x-0"
      // Pointer events cover mouse and touch alike; the previous mouse-only
      // guards let a touch drag on this pill pan the map underneath it.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 py-1.5 pe-1.5 ps-3">
        <span className="font-mono text-xs text-ink-2 tabular-nums">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-8 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
          aria-label="Clear selection"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
