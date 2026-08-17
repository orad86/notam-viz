// Leaflet touches `window` at import time, so it can only be pulled in on the
// client. This replaces the module-scoped `let L` the old MapView carried,
// which was assigned from inside a useEffect and typed loosely enough that
// every call site needed a cast.

import type * as LeafletModule from 'leaflet';

let cached: typeof LeafletModule | null = null;

export function getLeaflet(): typeof LeafletModule {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- Leaflet reads
  // `window` on import; a static import would break SSR and the iOS export.
  cached = require('leaflet') as typeof LeafletModule;
  return cached;
}
