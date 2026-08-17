'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export type Detent = 'peek' | 'half' | 'full';

/** Height of the collapsed card: grabber + one summary line. */
const PEEK_PX = 132;
/** Drag past peek by this much and the gesture becomes a dismiss. */
const DISMISS_SLOP_PX = 48;
/** Velocity (px/ms) above which a flick dismisses regardless of distance. */
const FLING_VELOCITY = 0.8;
/** How far ahead to project the release velocity when picking a detent. */
const PROJECTION_MS = 120;

interface Options {
  /** False on desktop: returns static styles and no handlers. */
  enabled: boolean;
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  onDismiss: () => void;
}

interface Sample {
  t: number;
  y: number;
}

/**
 * Draggable bottom sheet with peek/half/full detents, built on Pointer Events.
 *
 * No animation library — the approved dependencies were lucide-react, clsx and
 * tailwind-merge. Pointer capture does the heavy lifting: once captured, every
 * move and the release retarget to the grabber even outside its bounds or the
 * window, so there is no global listener bookkeeping and no lost-pointer case.
 */
export function useDragSheet({
  enabled,
  detent,
  onDetentChange,
  onDismiss,
}: Options) {
  // The node is held in STATE, not just a ref, so the measuring effect re-runs
  // when it actually attaches. DetailSurface renders null until it has mounted
  // (it portals to document.body), so a ref-only effect fired once against a
  // null node, bailed out, and never re-ran — leaving height at 0, which made
  // every detent resolve to 0 and the sheet always open full-height.
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(0);

  const start = useRef({ y: 0, offset: 0 });
  const samples = useRef<Sample[]>([]);

  // Re-measures on rotation and when mobile browser chrome collapses, both of
  // which change the sheet's height without a React render.
  useEffect(() => {
    if (!node || !enabled) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, enabled]);

  const offsets = useCallback(
    (h: number): Record<Detent, number> => ({
      full: 0,
      half: Math.round(h * 0.5),
      peek: Math.max(h - PEEK_PX, 0),
    }),
    [],
  );

  const restOffset = offsets(height)[detent];

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { y: e.clientY, offset: restOffset };
      samples.current = [{ t: e.timeStamp, y: e.clientY }];
      setDragging(true);
    },
    [enabled, restOffset],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragging || !node) return;

      const points = offsets(height);
      const raw = start.current.offset + (e.clientY - start.current.y);
      // Allow a little travel past peek so the dismiss gesture has somewhere to
      // go and feels like a throw rather than hitting a wall.
      const next = Math.min(
        Math.max(raw, 0),
        points.peek + DISMISS_SLOP_PX + 48,
      );

      // Written straight to the node. Routing per-frame position through React
      // state would re-render the whole detail body on every pointermove.
      node.style.transform = `translate3d(0, ${next}px, 0)`;

      samples.current.push({ t: e.timeStamp, y: e.clientY });
      if (samples.current.length > 5) samples.current.shift();
    },
    [dragging, height, offsets, node],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!dragging) return;
      setDragging(false);

      const points = offsets(height);
      const current = Math.min(
        Math.max(start.current.offset + (e.clientY - start.current.y), 0),
        points.peek + DISMISS_SLOP_PX + 48,
      );

      const first = samples.current[0];
      const last = samples.current[samples.current.length - 1];
      const dt = last && first ? last.t - first.t : 0;
      const velocity = dt > 0 ? (last.y - first.y) / dt : 0;

      if (
        current > points.peek + DISMISS_SLOP_PX ||
        (velocity > FLING_VELOCITY && current > points.half)
      ) {
        onDismiss();
        return;
      }

      const projected = current + velocity * PROJECTION_MS;
      const nearest = (Object.keys(points) as Detent[]).reduce((best, key) =>
        Math.abs(points[key] - projected) < Math.abs(points[best] - projected)
          ? key
          : best,
      );

      // Clear the inline transform so the class-driven rest position takes over
      // and animates; otherwise the node stays pinned where the finger left it.
      if (node) node.style.transform = '';
      onDetentChange(nearest);
    },
    [dragging, height, offsets, onDetentChange, onDismiss, node],
  );

  const style: CSSProperties = enabled
    ? {
        transform: `translate3d(0, ${restOffset}px, 0)`,
        transition: dragging
          ? 'none'
          : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
        userSelect: dragging ? 'none' : undefined,
      }
    : {};

  return {
    /** Callback ref — attach to the sheet element. */
    sheetRef: setNode,
    dragging,
    /** Spread onto the grabber strip. */
    handleProps: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          // The browser must not try to scroll from this strip, so there is no
          // competing gesture to preventDefault against mid-move (which iOS
          // treats as passive and would ignore anyway).
          style: { touchAction: 'none' as const },
        }
      : {},
    /**
     * Spread onto the scrollable content. At `peek` the whole card is a drag
     * surface; once expanded it scrolls natively.
     *
     * Deliberately NOT "drag when scrollTop === 0": iOS reads touch-action at
     * gesture start and will not let a scroll already in flight be cancelled,
     * so that behaviour half-works and feels broken.
     */
    contentProps:
      enabled && detent === 'peek'
        ? {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            style: { touchAction: 'none' as const, overflowY: 'hidden' as const },
          }
        : {
            style: {
              touchAction: 'pan-y' as const,
              overflowY: 'auto' as const,
              overscrollBehaviorY: 'contain' as const,
            },
          },
    style,
  };
}
