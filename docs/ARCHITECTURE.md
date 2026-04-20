# Architecture

System architecture, module responsibilities, and end-to-end data flow for notam-viz.

## Contents
- [Project overview](#project-overview)
- [High-level architecture](#high-level-architecture)
- [Request lifecycle](#request-lifecycle)
- [Module breakdown](#module-breakdown)
- [Frontend rendering pipeline](#frontend-rendering-pipeline)

## Project overview

**What the system does.** Retrieves the current set of published Israeli NOTAMs from the IAA's public mobile AeroInfo site, parses them into typed records, and presents them on an interactive Leaflet map. The whole app is one Next.js 14 (App Router) project; there is no backend service, no database, no scheduler, no auth.

**Core problem it solves.** The upstream IAA desktop page (`AeroInfo.aspx`) renders NOTAMs behind ASP.NET `UpdatePanel` postbacks gated by Radware Bot Manager, so each NOTAM's full body is practically unscrapable from plain HTTP. The IAA mobile endpoint serves the same data as static HTML — one list page + one detail page per NOTAM — behind a lighter WAF layer that can be passed with a browser-minted cookie jar.

**Key users / consumers.** Developers or aviation enthusiasts who want a read-only visualization of current Israeli NOTAMs. Not intended for operational flight planning.

**System boundaries (what is NOT included).**
- No NOTAM editing or ingestion from other sources (FAA DINS, ICAO iSTARS, etc.).
- No background fetch, cron, or queue — data is refreshed on-demand per `GET /api/notams`.
- No persistence: in-memory only between requests, plus a module-scoped cookie-jar cache.
- No multi-tenant support; one deployment = one upstream identity (the cookie jar).

## High-level architecture

```
 Browser ── GET / ──────────────► Next.js page (src/app/page.tsx)
                                       │ useEffect → fetch
                                       ▼
                                  /api/notams  (src/app/api/notams/route.ts)
                                       │
                                       ▼
                           scrapeMobileNotams()  (src/lib/scraper-mobile.ts)
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 │                     │                     │
         (jar from env)       (cached jar, <15m)     (Playwright mint)
                 │                     │                     │
                 └─────────────► cookie jar ◄────────────────┘
                                       │
                                       ▼
                          maiNotam.aspx  (list, ~114 rows)
                                       │
                                       ▼
               pool(4) × maiDetails.aspx?rowID=…  (detail HTML × N)
                                       │
                                       ▼
                          parseNotamBlock()  (src/lib/notam-parser.ts)
                               ├─ decodeQCode           (qcode-decoder.ts)
                               ├─ extractCoordinatesFromBody / parseQLineCoordinate (coord-parser.ts)
                               └─ getAirportCoords fallback (airport-coords.ts)
                                       │
                                       ▼
                                 NotamApiResponse
                                       │
                                       ▼
                       ParsedNotam[] → MapView / NotamList / NotamDetail
```

**Deployment shape.** Standard Next.js 14. `runtime = 'nodejs'` on the API route because Playwright requires Node, not the Edge runtime. Any Node host (Vercel, a VPS, Docker) works. A long-running process is preferred so the module-scoped cookie cache survives between requests.

**External dependencies.**
- **`playwright`** (runtime: Chromium) — used *only* to mint a challenge-passed cookie jar when `IAA_COOKIE_JAR` is not provided.
- **`cheerio`** — HTML parsing of both list and detail pages.
- **`leaflet`** + **`react-leaflet`** — map rendering.
- **`next`** — framework.
- **OpenStreetMap tile servers** — map basemap (referenced by URL template in [src/components/MapView.tsx](../src/components/MapView.tsx)).
- **IAA mobile site** — the one upstream data source.

## Request lifecycle

Step-by-step for a single `GET /api/notams` call from a cold-started server:

1. Next.js routes the request to `GET` in [src/app/api/notams/route.ts](../src/app/api/notams/route.ts).
2. The handler calls `scrapeMobileNotams()` from [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts).
3. `scrapeMobileNotams` calls `getJar(false)`. Precedence:
   - If `process.env.IAA_COOKIE_JAR` is set, `parseCookieHeader` returns a `Map<name,value>` and this jar is used unchanged (never refreshed).
   - Else if `cachedJar` (module-scoped) was minted less than `JAR_TTL_MS` (15 min) ago, reuse it.
   - Else if another request is already minting (`jarMintLock`), join that promise.
   - Else call `mintJarWithBrowser()` — launches headless Chromium with a few anti-fingerprint init scripts, navigates welcome → list → one detail page, reloads up to 3× if the first detail response is the Error 100 challenge, then reads `context.cookies()` into the jar.
4. `fetchList(jar)` does `GET /MobileAeroinfo/maiNotam.aspx` with the cookie header, UA + Client Hints + Sec-Fetch headers, and `Referer: …/maiwelcome.aspx`. Failure modes:
   - HTTP ≠ 200 → throws.
   - Body contains `<title>Error 100</title>` OR `< LIST_MIN_BYTES` (20 000) → throws `WafChallengeError`.
   - Empty `tr[onclick^="rowClicked"]` → throws.
   On `WafChallengeError`, the handler refreshes the jar once (`getJar(true)`) and retries.
5. The list page is parsed by `parseList` into `{ rowID, notamId, location }[]` — typically ~114 entries.
6. `runPool(entries, worker, CONCURRENCY=4)` fans out detail fetches. Each worker:
   - Calls `fetchDetailOnce` for `maiDetails.aspx?rowID=…&scrpos=0&mode=notam`.
   - On non-WAF transient error (`fetch failed`, HTTP 5xx) → sleep 800 ms, retry once.
   - On WAF challenge: if using `IAA_COOKIE_JAR`, throw a "cookies likely expired" error (env jar can't be auto-refreshed); otherwise call `getJar(true)` once per request (guarded by `wafRefreshed`) and retry.
   - On success, `parseDetailBlock` concatenates the text content of every `td.DetailsBlueLine b` cell with `\n` — that's the raw ICAO block.
   - Each worker waits `jitter()` (200–500 ms) before sending its request.
7. Results split into `rawBlocks[]` and `failed[]`.
8. Back in the route handler, each raw block is fed to `parseNotamBlock` ([src/lib/notam-parser.ts](../src/lib/notam-parser.ts)):
   - Extracts the ICAO ID and Q-line.
   - Splits Q-line on `/` into fir, qCode, significance, priority, scope, lowerLimit, upperLimit, coord.
   - Extracts items A–G with `extractItem` (regex stops at the next field marker whether newline- or whitespace-separated, so the mobile one-line `A) … B) … C) …` layout parses cleanly).
   - Runs `extractCoordinatesFromBody` (PSN-keyword patterns, standalone coords, compact DMS, DM fallback). Multiple coords → polygon, unless self-intersecting in vertex order, in which case `multipoint`.
   - Falls back to `parseQLineCoordinate` (DMS separated, compact DMS, or DM with radius).
   - Final fallback: `getAirportCoords(aItem) || getAirportCoords(fir)` from the lookup table in [src/lib/airport-coords.ts](../src/lib/airport-coords.ts).
   - `decodeQCode` / `formatQCodeExplanation` produce the human-readable subject/condition pair.
   - `determineCategory` maps the 2nd/3rd letters of the Q-code to `NotamCategory`, with an E-item keyword fallback.
   - Computes `effective`/`expires` from B/C lines (YYMMDDHHMM → ISO-8601; `PERM` preserved as the literal string).
9. The handler returns `NotamApiResponse` JSON with `Cache-Control: public, max-age=300`. Errors become entries in `response.errors[]` (plain strings); the handler never throws back at the client unless `scrapeMobileNotams` itself threw (then HTTP 500 with `errors: [message]`).

## Module breakdown

### `src/app/`

Next.js App Router. Client entry point and the one API route.

- [src/app/layout.tsx](../src/app/layout.tsx) — Root layout, loads Inter font, sets `<title>NOTAM Visualizer</title>`.
- [src/app/page.tsx](../src/app/page.tsx) — Client component. On mount, fetches `/api/notams`, stores results in React state, renders the header, `NotamList` sidebar, `MapView`, and `NotamDetail` pane.
- [src/app/api/notams/route.ts](../src/app/api/notams/route.ts) — The only API route. Declares `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. Calls the scraper, runs each block through the parser, returns `NotamApiResponse`.
- [src/app/globals.css](../src/app/globals.css) — Tailwind base layer + a small amount of custom CSS.

### `src/lib/`

Pure-TS library code. No React, no DOM.

- [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) — The only scraping module.
  - Exports: `scrapeMobileNotams(): Promise<ScrapeResult>`, `WafChallengeError`, `NotamListEntry`, `ScrapeResult`.
  - Internal state (module-scope): `cachedJar`, `jarMintLock`.
  - Constants: `CONCURRENCY = 4`, `MIN_JITTER_MS = 200`, `MAX_JITTER_MS = 500`, `DETAIL_MIN_BYTES = 4000`, `LIST_MIN_BYTES = 20000`, `JAR_TTL_MS = 15 * 60 * 1000`, `BROWSER_WARMUP_TIMEOUT_MS = 45000`.
  - See [docs/SCRAPING.md](SCRAPING.md) for a deep dive.
- [src/lib/notam-parser.ts](../src/lib/notam-parser.ts) — Converts one raw ICAO block to `ParsedNotam`.
  - Exports: `parseNotamBlock`, `splitNotamBlocks`.
  - Internal: `extractItem` (regex stops at `\s[A-GQ]\)` or end-of-string), `parseNotamDate` (YYMMDDHHMM → ISO), `determineCategory`.
- [src/lib/coord-parser.ts](../src/lib/coord-parser.ts) — Coordinate extraction.
  - Exports: `dmsToDec`, `dmToDecimal`, `parseCoordinatePair`, `parseQLineCoordinate`, `extractCoordinatesFromBody`.
  - Internal: `isValidIsraeliCoord` (bounds lat 27–36, lon 32–38), `segmentsIntersect`, `isSelfIntersectingPolygon`.
- [src/lib/qcode-decoder.ts](../src/lib/qcode-decoder.ts) — ICAO Q-code lookup.
  - Exports: `decodeQCode`, `formatQCodeExplanation`, `QCodeParts`.
  - Internal: `SUBJECT_CODES`, `CONDITION_CODES` tables (~140 entries).
- [src/lib/qcode-subjects.ts](../src/lib/qcode-subjects.ts) — Q-code subject → `NotamCategory` map.
  - Exports: `getCategoryFromQCode`, `getCategoryFromQLine`.
  - **Known bug:** `getCategoryFromQLine` takes the wrong substring — it extracts 4 chars after `Q` and then calls `.substring(1, 3)`, yielding characters 1–2 of the 4 (e.g. `FALC` → `AL`) instead of the first 2 (`FA`). Downstream, many NOTAMs fall through to the keyword-based fallback in `determineCategory`. See [docs/ROADMAP.md](ROADMAP.md) §Technical debt.
- [src/lib/airport-coords.ts](../src/lib/airport-coords.ts) — Hard-coded ICAO aerodrome/FIR lookup table for Israel (~15 entries: LLBG, LLHA, LLIB, LLLL, LLAK, …). Exports `getAirportCoords`, `getDefaultCoordForFIR`, `AIRPORT_COORDINATES`.

### `src/components/`

React client components. All marked `'use client'`.

- [src/components/MapView.tsx](../src/components/MapView.tsx) — Leaflet map + layer toggle panel.
  - Exports: default `MapView` component.
  - Internal: `NotamPopup` (shared for all geometry types), `LayerPanel`, `MapController` (flies/fits map to the selected NOTAM), `getCategoryColor`, `bboxArea`, `formatPopupDate`, `formatAltitudeRange`, `formatScope`, `formatTraffic`, `trimTrailingParen`.
  - Key constants: `FIR_SCALE_RADIUS_NM = 150` (circles ≥ this radius render as a `CircleMarker` dot at the center to avoid covering the basemap), `LAYER_META` (swatch/count per geometry type).
  - Draw order is `circle → polygon → multipoint → point`. Within the circle list, sorted so FIR-scale dots paint last (on top) and smaller normal circles paint above bigger ones. Polygons sorted by bounding-box area descending.
- [src/components/NotamList.tsx](../src/components/NotamList.tsx) — Left sidebar. Text search, category dropdown (`all | airspace | obstacle | navaid | runway | airport | procedure | military | other`), active-only toggle, sort selector (`newest | expiry | id`). Uses `notam.id` for React keys and filtering — this is the undeclared legacy alias for `notamId` (see [docs/ROADMAP.md](ROADMAP.md)).
- [src/components/NotamDetail.tsx](../src/components/NotamDetail.tsx) — Floating detail panel (bottom-right). Shows Q-code block, location/FIR, geometry summary, altitude limits, valid period, E-item, D/F/G fields, and a collapsible raw-text viewer with a "Copy raw text" button.

### `src/types/`

- [src/types/notam.ts](../src/types/notam.ts) — Sole type module. Defines `NotamCategory`, the `NotamPoint`/`NotamCircle`/`NotamPolygon`/`NotamMultiPoint` geometry union, `NotamDetails` (Q-line + A–G fields + parsed dates), `ParsedNotam` (adds derived fields), `NotamApiResponse`. See [docs/REFERENCE.md](REFERENCE.md).

### `public/`

- `public/leaflet/` — Leaflet marker icons copied from the library so `new L.Icon.Default` resolves from a stable path (set up in `MapView.tsx` on mount).

## Frontend rendering pipeline

1. `src/app/page.tsx` mounts client-side, sets `loading=true`, calls `fetch('/api/notams')`. `MapView` is lazy-imported via `next/dynamic({ ssr: false })` because Leaflet touches `window`.
2. On response, `notams` state is populated. The header shows the count and a refresh button.
3. Three components consume the same `ParsedNotam[]`:
   - **`NotamList`** — filters and sorts into its `filtered` memo; renders each hit as a button that calls the parent's `setSelectedNotam`.
   - **`MapView`** — groups NOTAMs by `geometry.type` in a `useMemo`, then sorts each group so smaller shapes paint last (see [src/components/MapView.tsx](../src/components/MapView.tsx) §`grouped`). Renders Leaflet `Circle` / `CircleMarker` / `Polygon` / `Marker` with per-category colour.
   - **`NotamDetail`** — when `selectedNotam != null`, a fixed-position panel renders with the full structured detail.
4. Selection propagates both ways: clicking a list row or a map shape calls `onSelectNotam`, which updates shared state, which causes the map's `MapController` to `flyTo` / `fitBounds` on the selected geometry.

There is no global state library — selection lives in `page.tsx` and is threaded via props.
