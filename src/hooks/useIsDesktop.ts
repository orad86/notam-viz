'use client';

import { useSyncExternalStore } from 'react';

// Tailwind's `md` breakpoint. Kept in one place because the detail surface
// switches component shape here, not just styling — a CSS-only answer cannot
// express "sheet vs docked panel".
const QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * SSR-safe viewport check.
 *
 * `useSyncExternalStore` rather than useState+useEffect so the server snapshot
 * is explicit (false — mobile first) and there is no flash of the wrong layout
 * between hydration and the first effect.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
