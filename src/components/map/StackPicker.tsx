'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers, X } from 'lucide-react';
import { ParsedNotam } from '@/types/notam';
import { decodeNotam } from '@/lib/notam/decode';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';

interface Props {
  notams: ParsedNotam[];
  /** Click position in map-container pixels. */
  at: { x: number; y: number };
  /** Currently focused NOTAM, so the stepper and list stay in sync with the map. */
  focusedId: string | null;
  /** Move focus without committing — the picker stays open. */
  onFocus: (n: ParsedNotam) => void;
  /** Commit a choice. The card folds to a chip; the stack stays reachable. */
  onPick: (n: ParsedNotam) => void;
  /** Retire the stack entirely — no chip, nothing to reopen. */
  onDismiss: () => void;
}

const CARD_WIDTH = 276;
const MAX_HEIGHT = 300;
const GAP = 8;

/**
 * Corner slot for the collapsed chip, mirroring its `start-3 top-16` classes.
 * `top-16` rather than `top-3` because SelectionToolbar owns the corner at md.
 */
const CHIP_LEFT = 12;
const CHIP_TOP = 64;
const CHIP_HEIGHT = 30;

/**
 * What the stack is currently showing.
 *
 * Re-opening from the chip docks the card under it rather than returning to the
 * click point: committing a NOTAM flies the map to it, so those coordinates no
 * longer describe anything on screen.
 */
type View = 'card-at-click' | 'chip' | 'card-at-corner';

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

/**
 * Shown when a single click lands on several overlapping NOTAMs.
 *
 * This is the whole point of the geometric hit test: Leaflet would have handed
 * the click to exactly one shape and the rest would be unreachable. Here every
 * NOTAM under the cursor is offered by name, and the stepper walks map focus
 * through them one at a time without dismissing the list.
 */
export default function StackPicker({
  notams,
  at,
  focusedId,
  onFocus,
  onPick,
  onDismiss,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [view, setView] = useState<View>('card-at-click');
  const isChip = view === 'chip';

  // Inactive while collapsed: the chip has to survive taps on the detail panel
  // and the map controls, and only its own X or the next map click retires it.
  useClickOutside(ref, !isChip, onDismiss);

  const decoded = useMemo(
    () => notams.map((n) => ({ notam: n, headline: decodeNotam(n).headline })),
    [notams],
  );

  // Derived from the map's focus rather than held locally, so stepping, clicking
  // a row, and focusing from the sidebar can never disagree about which of the
  // stacked NOTAMs is current.
  const activeIndex = focusedId
    ? notams.findIndex((n) => n.id === focusedId)
    : -1;

  const step = useCallback(
    (delta: number) => {
      if (notams.length === 0) return;
      // Wraps: a stack is a ring, and -1 (nothing focused yet) steps to the
      // first entry going forward and the last going back.
      const from = activeIndex === -1 ? (delta > 0 ? -1 : 0) : activeIndex;
      const next = (from + delta + notams.length) % notams.length;
      onFocus(notams[next]);
    },
    [activeIndex, notams, onFocus],
  );

  useEffect(() => {
    if (isChip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onDismiss, isChip]);

  // Keep the stepper's current entry visible when it walks past the fold.
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Kept inside the map container, which is NOT a fixed box: it is inset by the
  // sidebar at md, and loses another 380px the moment focusing a NOTAM opens the
  // desktop detail panel. So the size is observed, not read once — and the
  // position is CLAMPED rather than flipped, because a flip still overflows when
  // the container shrinks under a card that was already placed.
  //
  // Measured in a layout effect: `ref.current` is null during the first render,
  // so reading it inline pinned the card to a corner regardless of where the
  // user clicked. useLayoutEffect lands before paint, so nothing visibly jumps.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    const measure = () =>
      setBox({ w: parent.clientWidth, h: parent.clientHeight });
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const desired =
    view === 'card-at-corner'
      ? { left: CHIP_LEFT, top: CHIP_TOP + CHIP_HEIGHT + GAP }
      : { left: at.x + GAP, top: at.y + GAP };
  const left = box
    ? clamp(desired.left, GAP, box.w - CARD_WIDTH - GAP)
    : desired.left;
  const top = box
    ? clamp(desired.top, GAP, box.h - MAX_HEIGHT - GAP)
    : desired.top;

  const position = activeIndex >= 0 ? activeIndex + 1 : null;

  if (isChip) {
    return (
      <button
        type="button"
        onClick={() => setView('card-at-corner')}
        aria-label={`Reopen the list of ${notams.length} NOTAMs at the tapped point`}
        className="absolute start-3 top-16 z-[1050] inline-flex items-center gap-1.5 rounded-md border border-rule-strong bg-paper-raised px-2.5 py-1.5 shadow-md transition-colors hover:bg-paper-sunk"
        // Same pointer guards the other map overlays use, so a touch drag on
        // the chip does not pan the map underneath it.
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <Layers className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        <span className="plate-label">{notams.length} here</span>
      </button>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${notams.length} NOTAMs at this location`}
      className="absolute z-[1100] overflow-hidden rounded-md border border-rule-strong bg-paper-raised shadow-lg"
      style={{ width: CARD_WIDTH, left, top }}
    >
      <div className="flex items-center gap-1.5 border-b border-rule bg-paper-sunk px-2.5 py-1.5">
        <Layers className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        <span className="plate-label">{notams.length} here</span>

        {/* Steps map focus through the stack without closing the list. */}
        <div className="ms-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Focus previous NOTAM"
            className="inline-flex size-7 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span
            className="min-w-11 text-center font-mono text-2xs text-ink-2 tabular-nums"
            aria-live="polite"
          >
            {position ? `${position}/${notams.length}` : `–/${notams.length}`}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Focus next NOTAM"
            className="inline-flex size-7 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>

          {/* Tap-outside also dismisses, but on a map that same tap re-runs the
              hit test and can immediately mint a new stack — so touch needs a
              target that only ever closes. */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss this stack"
            className="ms-0.5 inline-flex size-7 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-paper-raised hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <ul
        ref={listRef}
        className="scrollbar-hairline max-h-[220px] overflow-y-auto"
      >
        {decoded.map(({ notam, headline }, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={notam.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(notam);
                  setView('chip');
                }}
                aria-current={isActive}
                className={cn(
                  'relative flex w-full flex-col items-start gap-0.5 border-b border-rule px-3 py-2.5 text-start transition-colors last:border-0',
                  isActive ? 'bg-accent-wash' : 'hover:bg-paper-sunk',
                )}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 start-0 w-0.5 bg-accent"
                  />
                )}
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'font-mono text-2xs font-medium',
                      isActive ? 'text-accent-text' : 'text-ink-2',
                    )}
                  >
                    {notam.notamId}
                  </span>
                  {notam.isActive && (
                    <span
                      className="size-1.5 rounded-pill bg-ok"
                      aria-label="Active"
                    />
                  )}
                </span>
                <span className="line-clamp-2 text-xs text-ink-2">{headline}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-rule bg-paper-sunk px-3 py-1.5 text-2xs text-ink-3">
        Arrows step focus · open a row and this list stays one tap away
      </p>
    </div>
  );
}
