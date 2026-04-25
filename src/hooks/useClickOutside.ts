import { RefObject, useEffect } from 'react';

// Calls `onOutside` when the user presses `mousedown` outside the element
// referenced by `ref`. Common pattern for closing popovers / menus / dropdowns.
// Pass `active` to gate the listener (useful when the popover is only mounted
// while open — avoids attaching/detaching through an effect branch).
export function useClickOutside(
  ref: RefObject<HTMLElement>,
  active: boolean,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, active, onOutside]);
}
