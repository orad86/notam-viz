import { RefObject, useEffect } from 'react';

// Calls `onOutside` when the user presses outside the element referenced by
// `ref`. Common pattern for closing popovers / menus / dropdowns. Pass `active`
// to gate the listener (useful when the popover is only mounted while open —
// avoids attaching/detaching through an effect branch).
//
// `pointerdown`, not `mousedown`: on touch, mousedown only arrives as a
// synthesized compatibility event, which fires late and is suppressed wherever
// something calls preventDefault first — Leaflet's gesture handlers and the
// global `touch-action: manipulation` both qualify. pointerdown is the event
// that actually fires on every input type.
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [ref, active, onOutside]);
}
