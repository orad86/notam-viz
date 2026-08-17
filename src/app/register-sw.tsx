'use client';

import { useEffect } from 'react';
import { APP_VERSION } from '@/lib/version';

export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      // The version rides in the script URL, and sw.js reads it back out of its
      // own location to name the shell cache.
      //
      // sw.js is served straight from public/ with no build step, so its
      // `self.__NOTAM_SW_VERSION__` placeholder was never substituted — the
      // cache was permanently named "notam-shell-dev" and the precached `/`
      // document was never invalidated. A changed script URL is also what makes
      // the browser treat this as a new worker and run `install` at all.
      navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`).catch(() => {
        // Registration failures are non-fatal; UI still works from network.
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);
  return null;
}
