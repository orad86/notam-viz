// Minimal, hand-rolled service worker for notam-viz.
// Goal: survive a cold start with no network so the UI shell renders, and
// fall back to the last successful /api/notams response when offline.

// Read from the registration URL (`/sw.js?v=0.7.0`) rather than a placeholder
// substituted at build time — this file is served verbatim out of public/, so
// nothing ever performed that substitution and the shell cache was pinned to
// "notam-shell-dev" across every release.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
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

  event.respondWith(cacheFirst(req));
});

// Cache-first, but it now also POPULATES the cache. Previously this only ever
// read, and SHELL_ASSETS lists no CSS or JS — so an offline cold start served
// the precached `/` document pointing at hashed bundles that were never stored,
// i.e. an unstyled page. The file's stated goal is that the shell renders with
// no network, which needs the build output cached too.
//
// Hashed filenames make this safe: a new build requests new URLs, and the old
// entries are dropped wholesale when SHELL_CACHE rotates on the version bump.
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;

  const resp = await fetch(req);
  if (resp.ok && resp.type === 'basic') {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(req, resp.clone());
  }
  return resp;
}

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
