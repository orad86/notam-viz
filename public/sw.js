// Minimal, hand-rolled service worker for notam-viz.
// Goal: survive a cold start with no network so the UI shell renders, and
// fall back to the last successful /api/notams response when offline.

const VERSION = self.__NOTAM_SW_VERSION__ || 'dev';
const SHELL_CACHE = `notam-shell-${VERSION}`;
const API_CACHE = 'notam-api-latest';
const API_PATH = '/api/notams';

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/aircraft.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === API_PATH) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/', { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)),
  );
});

async function networkFirst(req) {
  try {
    const resp = await fetch(req);
    if (resp.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(req, resp.clone());
    }
    return resp;
  } catch {
    const cache = await caches.open(API_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(
      JSON.stringify({ notams: [], fetchedAt: null, source: null, count: 0, errors: ['offline'] }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
