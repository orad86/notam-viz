# Architecture

System architecture, module responsibilities, and end-to-end data flow for notam-viz.

For the high-level orientation map (where do new files go?), see [STRUCTURE.md](STRUCTURE.md). This document is the deeper dive: lifecycles, responsibilities, and per-module notes.

## Contents
- [Project overview](#project-overview)
- [High-level architecture](#high-level-architecture)
- [Request lifecycle](#request-lifecycle)
- [Module breakdown](#module-breakdown)
- [Frontend rendering pipeline](#frontend-rendering-pipeline)

## Project overview

**What the system does.** A daily GitHub Action scrapes the IAA mobile AeroInfo site, parses each NOTAM block, and writes a single `NotamApiResponse` snapshot to Vercel KV. The Next.js app reads that snapshot through `/api/notams`, caches it at the CDN edge, and renders every NOTAM on an interactive Leaflet map with filter, route-planner, aviation-reference layers, and PDF/GPX/KML export.

**Core problem it solves.** The IAA desktop page (`AeroInfo.aspx`) renders NOTAMs behind ASP.NET `UpdatePanel` postbacks gated by Radware Bot Manager, so the full body is practically unscrapable from plain HTTP. The IAA mobile endpoint serves the same data as static HTML — one list page + one detail page per NOTAM — behind a lighter WAF layer that can be passed with a browser-minted cookie jar. Scraping once a day via a GitHub runner keeps the upstream load tiny and decouples user requests from the WAF.

**Key users / consumers.** Developers or aviation enthusiasts who want a read-only briefing view of current Israeli NOTAMs. Not intended for operational flight planning.

**System boundaries (what is NOT included).**
- No NOTAM editing or ingestion from other sources (FAA DINS, ICAO iSTARS, etc.).
- No per-user state, no auth, no accounts.
- No SQL database — Vercel KV (Upstash Redis) holds a single JSON snapshot under `notams:latest`.
- No continuous polling — the scraper runs on a cron (GitHub Actions, daily) plus a manual-dispatch trigger.

## High-level architecture

```
 ┌──────────────────────────── daily cron ────────────────────────────┐
 │                                                                     │
 │   GitHub Actions ── scripts/scrape.ts ── scrapeMobileNotams()      │
 │                              │       (src/lib/server/scraper-mobile)│
 │                              │                                      │
 │                              ▼                                      │
 │                 maiNotam.aspx (list)  +  pool(4) × maiDetails.aspx  │
 │                              │                                      │
 │                              ▼                                      │
 │                  parseNotamBlock (src/lib/notam/parser.ts)          │
 │                              │                                      │
 │                              ▼                                      │
 │                  setLatestNotams (src/lib/server/kv.ts)             │
 │                              │                                      │
 │                              ▼                                      │
 │                 Vercel KV  {  notams:latest  }                      │
 └──────────────────────────────┬──────────────────────────────────────┘
                                │
 Browser ── GET / ────► Next.js page (src/app/page.tsx)
                                │
                                ▼
                   /api/notams (src/app/api/notams/route.ts)
                                │
                                ▼
                   getLatestNotams (src/lib/server/kv.ts)
                                │
                                ▼
                          Vercel KV (Upstash)
                                │
                                ▼
              ParsedNotam[] → MapView + NotamList + filters + route
```

**Deployment shape.** Standard Next.js 14 on Vercel. The API route is `runtime = 'nodejs'`; it reads request headers for per-IP rate-limiting so it's fully dynamic — ISR is not in play. All CDN caching is driven by `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. The scraper runs in GitHub Actions, not in the Vercel function — so Vercel deployments don't need Playwright or Chromium.

**External dependencies.**
- **Vercel KV / Upstash Redis** — single-key JSON store for the latest snapshot.
- **GitHub Actions runner** — environment for the daily scrape (`playwright` + Node).
- **`playwright`** (runtime: Chromium) — only used by the scraper when `IAA_COOKIE_JAR` is not provided (i.e. falls back to minting a fresh jar).
- **`cheerio`** — HTML parsing of list and detail pages.
- **`leaflet`** + **`react-leaflet`** — map rendering.
- **OpenStreetMap tile servers** — basemap tiles (client-side).
- **IAA mobile site** — the one upstream data source.

## Request lifecycle

Two separate flows.

### A) Daily scrape (GitHub Actions → KV)

1. `.github/workflows/scrape.yml` fires on cron (or manual dispatch) and runs `npx tsx scripts/scrape.ts` with `IAA_COOKIE_JAR`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` injected as secrets.
2. `scrapeMobileNotams()` in [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts) minting precedence:
   - If `process.env.IAA_COOKIE_JAR` is set, use it unchanged (no Playwright) for the initial attempt.
   - Else reuse the module-scoped `cachedJar` if younger than `JAR_TTL_MS` (15 min).
   - Else mint a fresh jar via headless Chromium (welcome → list → one detail page, both pages gated by `isListPageValid` / `isDetailPageValid` with up to 3× reload past an Error 100 challenge). On a WAF rejection of the env jar, `getJar(true)` bypasses the env short-circuit and falls through to a fresh Playwright mint — reusing env cookies that just got rejected would only reproduce the failure.
3. `fetchList(jar)` hits `GET /MobileAeroinfo/maiNotam.aspx`. `isListPageValid` requires `tr[onclick="rowClicked(...)"]` rows; the only negative signals are `<title>Error 100</title>` and body < `LIST_MIN_CHARS` = 20 000 (the `stormcaster.js` probe was a third marker through 0.4.0, dropped in 0.4.1 once Radware started embedding it on authenticated responses too). Rejection throws `WafChallengeError`; the caller refreshes the jar once and retries.
4. `parseList` emits `{ rowID, notamId, location }[]` (~100-120 entries).
5. `runPool(entries, worker, CONCURRENCY=4)` fans out detail fetches; each worker waits `jitter()` (200–500 ms), retries once on transient failure, re-mints jar once per scrape on WAF.
6. `parseNotamBlock` ([src/lib/notam/parser.ts](../src/lib/notam/parser.ts)) turns each raw block into `ParsedNotam`:
   - Q-line → fir / qCode / significance / priority / scope / lowerLimit / upperLimit / coord.
   - `extractItem` regex isolates A–G fields (stops at next field marker — works for the mobile one-line layout).
   - `extractCoordinatesFromBody` + `parseQLineCoordinate` + `getAirportCoords` fallback produce the `NotamGeometry`.
   - `decodeQCode` + `determineCategory` emit the subject/condition pair and typed category.
   - B/C lines → ISO `effective`/`expires` (`PERM` preserved literally).
7. The resulting `NotamApiResponse` is written to KV at key `notams:latest` via `setLatestNotams`.

### B) Browser request (KV → UI)

1. Browser loads `/`. The server component at `src/app/page.tsx` reads `TERMS.md` and `PRIVACY.md` from the repo root and renders the client `HomePage`, which `fetch('/api/notams')` on effect.
2. [src/app/api/notams/route.ts](../src/app/api/notams/route.ts) calls `getLatestNotams()` from [src/lib/server/kv.ts](../src/lib/server/kv.ts) — a single GET against `{KV_REST_API_URL}/get/notams:latest` with `Authorization: Bearer {KV_REST_API_TOKEN}`.
3. On hit → responds 200 with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. On miss (empty KV) → 503 `{ errors: ['No cached NOTAMs in KV yet — run the scrape workflow'] }`. On throw → 500 with the error message.
4. Page stores the parsed list in React state and renders.

## Module breakdown

### `src/app/`

Next.js App Router. Client entry point plus the one API route.

- [src/app/layout.tsx](../src/app/layout.tsx) — root layout, Inter font, `<title>NOTAM Visualizer</title>`.
- [src/app/page.tsx](../src/app/page.tsx) — server component. Reads `TERMS.md` and `PRIVACY.md` from the repo root and passes them to the client `HomePage` so the in-app legal modal has content without a separate route or markdown runtime dep.
- [src/app/api/notams/route.ts](../src/app/api/notams/route.ts) — `runtime = 'nodejs'` (dynamic — reads headers for rate-limiting). Reads KV via `getLatestNotams()`; rate-limits via `checkRateLimit` from [src/lib/server/rate-limit.ts](../src/lib/server/rate-limit.ts); emits structured logs via [src/lib/server/log.ts](../src/lib/server/log.ts).
- [src/app/globals.css](../src/app/globals.css) — Tailwind base + Leaflet/divIcon/aviation-label overrides.

### `src/lib/notam/`

NOTAM-domain logic. Pure TypeScript, no React, no DOM, no Node-specific APIs.

- [src/lib/notam/parser.ts](../src/lib/notam/parser.ts) — `parseNotamBlock`, `splitNotamBlocks`, `determineCategory`.
- [src/lib/notam/coord-parser.ts](../src/lib/notam/coord-parser.ts) — `dmsToDec`, `dmToDecimal`, `parseCoordinatePair`, `parseQLineCoordinate`, `extractCoordinatesFromBody`.
- [src/lib/notam/qcodes.ts](../src/lib/notam/qcodes.ts) — single owner of ICAO Q-code reference data and decoding. Three module-private tables (`SUBJECT_CATEGORIES`, `SUBJECT_DESCRIPTIONS`, `CONDITION_DESCRIPTIONS`) plus `getCategoryFromQCode`, `getCategoryFromQLine`, `decodeQCode`, `formatQCodeExplanation`, and the `QCodeParts` type.
- [src/lib/notam/airports.ts](../src/lib/notam/airports.ts) — hard-coded ICAO aerodrome/FIR lookup (Israel). `AIRPORT_COORDINATES` map plus `getAirportCoords`.
- [src/lib/notam/format.ts](../src/lib/notam/format.ts) — display helpers: `formatUtcDate`, `eItemText`, `formatAltitudeRange`, `formatScope`, `formatTraffic`, `getCategoryColor`, `FIR_SCALE_RADIUS_NM`.
- [src/lib/notam/geometry.ts](../src/lib/notam/geometry.ts) — pure NOTAM-geometry math. Currently `bboxArea(n)`, used by MapView to sort polygons largest-first so big areas render under smaller ones.
- [src/lib/notam/altitude.ts](../src/lib/notam/altitude.ts) — `parseAltitudeFt` for user input (`FL080`, `5500ft`, `SFC`, `UNL`) + `parseQLineAltitudeFt` for ICAO Q-line 3-digit codes (`005` → 500 ft, `999` → Infinity) + `altitudeBandFt`.
- [src/lib/notam/route-filter.ts](../src/lib/notam/route-filter.ts) — route planning: `RoutePoint`, `Route`, `TimeWindow`, `buildRoutePointIndex`, `resolveRouteTokens`, `parseRouteInput`, `haversineNm`, `pointToRouteDistanceNm`, `notamOverlapsWindow`, `notamMatchesRoute`, `buildCorridorPolygon`. `ROUTE_BUFFER_KM = 1`.

### `src/lib/server/`

Server-only modules. Run on Node, read env vars, talk to KV / Upstash / Playwright. Never imported by a client component.

- [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts) — scraping module. See [docs/SCRAPING.md](SCRAPING.md). Constants: `CONCURRENCY=4`, `JITTER_MS=200..500`, `DETAIL_MIN_CHARS=4000`, `LIST_MIN_CHARS=20000`, `JAR_TTL_MS=15 min`. Exports `isListPageValid` / `isDetailPageValid` for positive-signal WAF detection.
- [src/lib/server/kv.ts](../src/lib/server/kv.ts) — thin Upstash REST client: `getLatestNotams`, `setLatestNotams`.
- [src/lib/server/config.ts](../src/lib/server/config.ts) — single source of truth for upstream URLs (`IAA_BASE`, `IAA_LIST_URL`, `iaaDetailUrl`), the KV key (`KV_LATEST_KEY`), and cache windows (`CACHE_MAX_AGE_SECONDS`, `CACHE_STALE_SECONDS`). Imported by the scraper, the API route, and `scripts/scrape.ts`.
- [src/lib/server/log.ts](../src/lib/server/log.ts) — structured JSON-line logger. `log(level, event, fields)` emits one record per call to stdout (info/debug) or stderr (warn/error). `timer(event)` returns a closure that logs duration on invocation.
- [src/lib/server/rate-limit.ts](../src/lib/server/rate-limit.ts) — `@upstash/ratelimit` sliding window (30/min per IP), fail-open on backend unavailability. `clientKeyFromRequest` derives the bucket key from `req.ip` → `x-forwarded-for` → `x-real-ip` → `'anon'`; `maskIpForLog` truncates to /24 or /64 for log emission.

### `src/lib/export/`

File-format builders for the export menu (PDF / KML / GPX).

- [src/lib/export/pdf.ts](../src/lib/export/pdf.ts) — print-dialog HTML.
- [src/lib/export/kml.ts](../src/lib/export/kml.ts) — Google-Earth placemarks.
- [src/lib/export/gpx.ts](../src/lib/export/gpx.ts) — GPS waypoints/tracks.
- [src/lib/export/download.ts](../src/lib/export/download.ts) — Blob trigger + XML/HTML escaping + timestamp suffix.

### `src/lib/` (top-level, no domain home)

- [src/lib/kml-layer.ts](../src/lib/kml-layer.ts) — tiny KML point-placemark parser (`parseKmlPoints`) + cached URL loader (`loadKmlPoints`). Browser-side, used by `KmlLayer` and `HomePage`.
- [src/lib/aviation-icons.ts](../src/lib/aviation-icons.ts) — inline SVG symbols (airport / VOR / VFR / IFR) + `getAviationIcon` (Leaflet `divIcon`) + `getAviationIconSvg` (raw HTML for the legend).
- [src/lib/render-markdown.tsx](../src/lib/render-markdown.tsx) — minimal markdown → React renderer (headings, paragraphs, lists, bold, code, links, hr). Shared by `LegalModal` (in-app) and the public docs pages so the markdown styling stays in one place.
- [src/lib/version.ts](../src/lib/version.ts) — re-exports `version` from `package.json` as `APP_VERSION`. Rendered in the sidebar footer next to the Terms / Privacy buttons.

### `src/hooks/`

Custom React hooks. `useThing.ts` (camelCase) per project convention.

- [src/hooks/useDeviceLocation.ts](../src/hooks/useDeviceLocation.ts) — geolocation hook. Returns lat/lon, status, accuracy, and a `start()` / `stop()` pair driven by the browser Geolocation API.
- [src/hooks/useNotamFilter.ts](../src/hooks/useNotamFilter.ts) — wraps search / category / active-only / time-window / sort state for the filter bar.
- [src/hooks/useClickOutside.ts](../src/hooks/useClickOutside.ts) — close-on-mousedown-outside helper. Used by `ExportMenu`, `NotamFilterBar` (sort + time popovers), and `RouteInput` autocomplete.

### `src/app/` route pages

- [src/app/page.tsx](../src/app/page.tsx) — server component. Reads `TERMS.md` and `PRIVACY.md` at build time, passes them to `<HomePage />`.
- [src/app/support/page.tsx](../src/app/support/page.tsx) — public Support page (statically rendered). Quick start, filtering, route planner, exports, position layer, troubleshooting, contact. Used as the App Store Connect Support URL.
- [src/app/privacy/page.tsx](../src/app/privacy/page.tsx) — renders `PRIVACY.md` via `renderMarkdown`. Used as the App Store Connect Privacy Policy URL.
- [src/app/terms/page.tsx](../src/app/terms/page.tsx) — renders `TERMS.md` via `renderMarkdown`.

### `src/components/`

All `'use client'`.

- [src/components/MapView.tsx](../src/components/MapView.tsx) — Leaflet map. Renders NOTAM geometry (circle / polygon / multipoint / point) with z-order sort, popups, route polyline + 1 km corridor polygon or single-point 1 km circle, KML reference layers, and the layer panel (NOTAM + reference toggles). `FIR_SCALE_RADIUS_NM = 150` NM — big circles render as center dots instead of opaque fills. Background click and ESC clear the selection. All NOTAM shapes share one set of style constants at the top of the file (`NOTAM_COLOR`, `NOTAM_SELECTED_COLOR`, `NOTAM_FILL_OPACITY*`, `NOTAM_STROKE_OPACITY`, `NOTAM_WEIGHT*`, `NOTAM_SELECTED_DASH`) — category-based coloring is intentionally not applied on the map. Selection toggles a darker stroke + dashed outline + bumped fill opacity, consistently across all shape types.
- [src/components/NotamList.tsx](../src/components/NotamList.tsx) — sidebar; fixed on desktop, slide-in drawer on mobile. Displays one-line rows (category dot · ID · active dot · title). Takes the already-filtered list as a prop.
- [src/components/NotamFilterBar.tsx](../src/components/NotamFilterBar.tsx) — sticky filter bar: search with count, 🕐 time-window pill, ⬇ export pill, ⇅ sort popover, category chips, Clear filters link.
- [src/components/RouteInput.tsx](../src/components/RouteInput.tsx) — route planner: autocomplete over all four KML indices (airports / navaids / VFR / IFR), tokens rendered as pills, altitude input. Collapsible disclosure in the sidebar.
- [src/components/KmlLayer.tsx](../src/components/KmlLayer.tsx) — React-Leaflet LayerGroup that fetches one KML, parses it via `loadKmlPoints`, renders each point as a Marker with `divIcon` (aviation symbol) and a permanent Tooltip (name label).
- [src/components/ExportMenu.tsx](../src/components/ExportMenu.tsx) — dropdown (PDF / GPX / KML). Props: `notams: ParsedNotam[]`, `variant: 'pill' | 'compact'`.
- [src/components/SelectionToolbar.tsx](../src/components/SelectionToolbar.tsx) — map overlay that appears only when `selectedIds.size > 0`. Shows count + Clear.
- [src/components/HomePage.tsx](../src/components/HomePage.tsx) — `'use client'` root for the map page. Orchestrates filter + route + selection + disclaimer + legal-modal state, loads KML indices, fetches `/api/notams`, renders header + `NotamList` + `NotamFilterBar` + `RouteInput` + `MapView` + `DisclaimerModal` + `LegalModal`. Takes the two legal markdown strings as props from the server page.
- [src/components/LegalModal.tsx](../src/components/LegalModal.tsx) — overlay dialog that renders a markdown string via the shared `renderMarkdown`. Esc, backdrop click, and close button dismiss it. Triggered from the sidebar footer or from inside `DisclaimerModal`. z-index `z-[10030]` so it stacks above the disclaimer.
- [src/components/DisclaimerModal.tsx](../src/components/DisclaimerModal.tsx) — startup disclaimer; shown on every launch, requires explicit Accept to dismiss (no Esc / backdrop dismissal, no localStorage gate). Footer row exposes `APP_VERSION` and inline Terms / Privacy buttons that call into the same `setLegalDoc` setter as the sidebar footer. z-index `z-[10020]`.
- [src/components/DocsLayout.tsx](../src/components/DocsLayout.tsx) — shared shell for `/support`, `/privacy`, `/terms`: header link back to the app, scroll container (`100dvh`, `overflow-y: auto`), centered max-width main, footer with version + cross-links + safe-area padding.

### `src/types/`

- [src/types/notam.ts](../src/types/notam.ts) — `NotamCategory`, `NotamGeometry` union (`NotamPoint | NotamCircle | NotamPolygon | NotamMultiPoint`), `NotamDetails`, `ParsedNotam`, `NotamApiResponse`. See [docs/REFERENCE.md](REFERENCE.md).

### `public/`

- `public/leaflet/` — Leaflet default-marker assets copied from the library.
- `public/kml/` — four bundled reference KMLs: `airports.kml`, `navaids.kml`, `vfr_waypoints.kml`, `ifr_waypoints.kml`.

### `scripts/`

- [scripts/scrape.ts](../scripts/scrape.ts) — one-shot CLI: scrape → parse → `setLatestNotams`. Invoked by the GitHub Action and for manual local refreshes.

### `.github/workflows/`

- [.github/workflows/scrape.yml](../.github/workflows/scrape.yml) — daily cron + `workflow_dispatch` trigger that runs `scripts/scrape.ts` with the cookie jar + KV creds as secrets.
- [.github/workflows/ci.yml](../.github/workflows/ci.yml) — lint + typecheck + test on every pull request and push to `main`. Node 20, no Playwright install (tests are library-only).

### Tests

- [tests/notam/](../tests/notam/) — Vitest unit tests for each NOTAM-domain module: `parser`, `coord-parser`, `qcodes`, `altitude`, `format`, `geometry`, `route-filter`. Mirror `src/lib/notam/`.
- [tests/server/](../tests/server/) — Vitest tests for server-only modules. Currently the scraper's positive-signal WAF validators (`scraper-mobile.test.ts`).
- [tests/fixtures/iaa/](../tests/fixtures/iaa/) — captured HTML shapes used by the scraper validator tests.

See [docs/TESTING.md](TESTING.md) for the coverage matrix and conventions.

## Frontend rendering pipeline

1. `HomePage` mounts client-side (rendered by the server `src/app/page.tsx`, which also provides the legal markdown strings), sets `loading=true`, calls `fetch('/api/notams')`. `MapView` is lazy-imported via `next/dynamic({ ssr: false })` because Leaflet touches `window`.
2. `useNotamFilter(notams)` produces `filtered` (search + category + active-only + time-window + sort applied). If a route is set, a second pass via `notamMatchesRoute` narrows to the route corridor and altitude band → `finalList`.
3. `finalList` is passed to both `NotamList` (rows) and `MapView` (geometry). The filter bar pill (⬇ N) receives `notamsForExport`, which equals the selected NOTAMs when any are checked in the list/map, otherwise falls back to `finalList`.
4. When the user focuses a NOTAM (list click or shape click), `MapController` in `MapView` flies/fits the map to the geometry and programmatically opens the popup via a ref map keyed by notam id.
5. Selection multi-state (`selectedIds: Set<string>`) is lifted to `HomePage`; shift-click on the map, click checkbox in popup, or click checkbox in list row all feed the same Set. Selection drives Export scope (see step 3) but is orthogonal to the filtered view.

No global state library. Filter, route, selection, and legal-modal state all live in `HomePage` and flow through props.
