'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getAviationIconSvg } from '@/lib/aviation-icons';
import { KML_META, LAYER_META, type KmlKey, type LayerKey } from './constants';

interface Props {
  counts: Record<LayerKey, number>;
  visible: Record<LayerKey, boolean>;
  onToggle: (key: LayerKey) => void;
  onSetAll: (value: boolean) => void;
  kmlVisible: Record<KmlKey, boolean>;
  kmlCounts: Record<KmlKey, number>;
  onToggleKml: (key: KmlKey) => void;
}

const MOBILE = '(max-width: 767px)';

/** Collapsed by default on phones, where the panel would cover the map. */
function useStartCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE);
    setCollapsed(mql.matches);

    // The previous implementation read matchMedia once inside a useState
    // initializer, so rotating a tablet across the breakpoint never
    // re-evaluated and the panel could be stranded open over the map.
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return collapsed;
}

export default function LayerPanel({
  counts,
  visible,
  onToggle,
  onSetAll,
  kmlVisible,
  kmlCounts,
  onToggleKml,
}: Props) {
  const startCollapsed = useStartCollapsed();
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !startCollapsed;

  return (
    <div
      className="absolute end-3 top-3 z-[1050] w-[210px] overflow-hidden rounded-md border border-rule bg-paper-raised shadow-md"
      // Guards against the panel's own gestures reaching the map. Pointer
      // events cover mouse AND touch; the old mouse-only guards let a touch
      // drag on the panel pan the map underneath it.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-paper-sunk"
      >
        <span className="plate-label">Layers</span>
        {expanded ? (
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 text-ink-3" aria-hidden />
        )}
      </button>

      {expanded && (
        <>
          <div className="flex items-center justify-between border-y border-rule bg-paper-sunk px-3 py-1.5">
            <span className="plate-label">NOTAMs</span>
            <span className="flex items-center gap-2 text-2xs">
              <button
                type="button"
                className="rounded-xs px-1 text-accent-text transition-colors hover:bg-accent-wash"
                onClick={() => onSetAll(true)}
              >
                all
              </button>
              <button
                type="button"
                className="rounded-xs px-1 text-ink-3 transition-colors hover:bg-paper hover:text-ink"
                onClick={() => onSetAll(false)}
              >
                none
              </button>
            </span>
          </div>

          <div className="p-1.5">
            {LAYER_META.map(({ key, label }) => (
              <label
                key={key}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-1.5 transition-colors hover:bg-paper-sunk"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[--accent-strong]"
                  checked={visible[key]}
                  onChange={() => onToggle(key)}
                />
                <span
                  className="size-3 shrink-0 rounded-xs border border-danger/40 bg-danger/15"
                  aria-hidden
                />
                <span className="text-xs text-ink-2">{label}</span>
                <span className="ms-auto font-mono text-2xs text-ink-3 tabular-nums">
                  {counts[key]}
                </span>
              </label>
            ))}
          </div>

          <div className="border-y border-rule bg-paper-sunk px-3 py-1.5">
            <span className="plate-label">Reference</span>
          </div>

          <div className="p-1.5">
            {KML_META.map(({ key, label, iconType }) => (
              <label
                key={key}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-1.5 transition-colors hover:bg-paper-sunk"
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[--accent-strong]"
                  checked={kmlVisible[key]}
                  onChange={() => onToggleKml(key)}
                />
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center"
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: getAviationIconSvg(iconType) }}
                />
                <span className="text-xs text-ink-2">{label}</span>
                <span className="ms-auto font-mono text-2xs text-ink-3 tabular-nums">
                  {kmlCounts[key] || ''}
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
