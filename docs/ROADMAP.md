# Roadmap

Current testing state, security posture, known technical debt, and prioritized improvements. Everything here is grounded in the committed code — no items are invented or aspirational without being labeled as such.

## Contents
- [Completed in v0.3.0](#completed-in-v030)
- [Testing](#testing)
- [Security considerations](#security-considerations)
- [Technical debt](#technical-debt)
- [Suggested improvements](#suggested-improvements)

## Completed in v0.3.0

Shipped since v0.2.0 (2026-04):

- **Data ops.** Daily GitHub Action (`.github/workflows/scrape.yml`) runs `scripts/scrape.ts` → parses → writes a single `notams:latest` key to Vercel KV. The Next.js API reads from KV with `s-maxage=3600, stale-while-revalidate=86400`. Upstream load is now 1 list + ~114 detail fetches per 24 h instead of per user request.
- **Touch-first UI.** Sidebar becomes a slide-in drawer on `<md` with a hamburger in the header and backdrop-tap dismiss. Removed the heavy `NotamDetail` card — the Leaflet popup is the sole detail surface. Click-to-deselect on map background; ESC clears selection.
- **Simplified sidebar.** Filter state lifted out of `NotamList` into [`src/lib/use-notam-filter.ts`](../src/lib/use-notam-filter.ts). New [`NotamFilterBar`](../src/components/NotamFilterBar.tsx) with search + count + sort popover + category chips + global time-window popover (`Now / 2h / 24h / 7d / custom`). Rows collapsed to one-line (dot · ID · title). Selection strip shows only count + Clear.
- **Route planner.** New [`RouteInput`](../src/components/RouteInput.tsx) with autocomplete over all four bundled KMLs. [`src/lib/route-filter.ts`](../src/lib/route-filter.ts) resolves tokens → `RoutePoint[]`, runs haversine + point-to-segment distance checks, intersects NOTAM altitude bands (via `parseQLineAltitudeFt` in [`src/lib/altitude-parse.ts`](../src/lib/altitude-parse.ts)). Corridor is 1 km wide; single-point routes degrade to a 1 km radius circle. Polyline + corridor rendered on the map.
- **Aviation reference layers.** Four bundled KMLs (`public/kml/airports.kml`, `navaids.kml`, `vfr_waypoints.kml`, `ifr_waypoints.kml`) parsed by [`src/lib/kml-layer.ts`](../src/lib/kml-layer.ts), rendered as Jeppesen-style SVG symbols via [`src/lib/aviation-icons.ts`](../src/lib/aviation-icons.ts) with permanent name tooltips. Layer panel gained a Reference section whose legend uses the same SVG symbols as the markers.
- **Export UX.** [`ExportMenu`](../src/components/ExportMenu.tsx) generalized (`notams` prop, `variant: 'pill' | 'compact'`) and slotted into the filter bar as a ⬇ pill. Scope is the current view (filter + route applied) — no selection required. PDF layout trimmed to essentials (ID, validity, location, altitude, schedule, E-item) — Q-code, FIR, geometry, traffic, and scope removed per user preference.

Removed in this release: the Select-mode toggle, `RectangleSelector`, and the large `NotamDetail` card.



## Testing

**No automated tests exist.** Confirmed by inspecting `package.json` (no `test` script, no `jest`/`vitest`/`playwright-test` devDependency) and the repo root (no `__tests__/`, `*.test.ts`, `*.spec.ts`, or `e2e/` directory).

Coverage matrix (inferred, all zero):

| Layer | Present? | What a test would cover |
|---|---|---|
| Unit — `notam-parser.ts` | No | `parseNotamBlock` against fixture NOTAM text (PERM, DM coords, multi-line E-item, missing Q-line, same-line A/B/C mobile layout). |
| Unit — `coord-parser.ts` | No | `parseCoordinatePair`, `parseQLineCoordinate` (all three format branches), `extractCoordinatesFromBody` (PSN-prefixed, standalone, mixed), `isSelfIntersectingPolygon`. |
| Unit — `qcode-decoder.ts` / `qcode-subjects.ts` | No | Known codes map to expected subject/category; unknown codes don't throw. The substring bug in `getCategoryFromQLine` would have been caught immediately here. |
| Integration — `scraper-mobile.ts` | No | Recorded HTTP fixtures (list page, detail page, Error 100 challenge) replayed through `parseList` / `parseDetailBlock` / the retry state machine. |
| E2E | No | Playwright test driving the live app at `localhost:3000` and asserting map content renders. |

**Gaps / risks from having no tests:**

- Parser changes can silently drop fields. The `extractItem` regex change that makes the mobile layout parse correctly has no test pinning that behaviour, so a regression would not be caught before deployment.
- The Q-code substring bug (below) has gone undetected precisely because nothing compares `determineCategory('LLLL/QFALC/…')` against the expected `'airport'`.
- `extractCoordinatesFromBody` has six regex branches guarded by `if (coords.length === 0)`. A refactor could shift precedence without any alarm going off.
- WAF retry logic is stateful across two workers; a concurrency bug (e.g. `wafRefreshed` race) would only manifest in production traffic.

A minimum credible test suite: Jest/Vitest for `src/lib/*`, fixture-based; one recorded-HTTP integration test for `scrapeMobileNotams` using `msw` or equivalent; one Playwright smoke test for the rendered map. This is the single highest-ROI improvement.

## Security considerations

- **AuthN/AuthZ:** none. `GET /api/notams` is open to anyone who can reach the server. Acceptable for public data, but if this is ever deployed behind a login gate, the route needs its own checks.
- **Rate limiting:** none. A malicious caller hitting `/api/notams` faster than every 5 minutes defeats the `Cache-Control: max-age=300` and drives real upstream load, potentially getting the server's IP flagged by Radware.
- **Session token in env:** `IAA_COOKIE_JAR` carries a live Radware-issued session token that represents a human browser's challenge pass. Leaking it lets anyone make requests that impersonate that session until it expires (~hours to a day). Mitigations:
  - `.gitignore` includes `.env*.local` (confirmed).
  - `.env.local.example` contains only placeholder `…` values.
  - No code logs the full cookie jar. `cookieHeader(jar)` output is not printed anywhere.
- **Playwright runtime:** launches Chromium headless with `--disable-blink-features=AutomationControlled`, `--disable-features=IsolateOrigins,site-per-process`, and `navigator.webdriver` patched. These reduce fingerprint signal to Radware; they do not reduce local security. Chromium runs in the Node process's UID; do not run the server as root.
- **No input from user:** `/api/notams` takes no query parameters or body. Nothing to sanitize.
- **CORS:** default Next.js behaviour (no CORS headers). Browsers can only call it from the same origin.
- **External content:** map tiles come from `tile.openstreetmap.org` via the URL in [src/components/MapView.tsx](../src/components/MapView.tsx). Tiles are fetched by the client, not the server.

Not-an-issue-here:

- SQL injection — no SQL.
- XSS through `eItem` — React escapes text by default; `NotamDetail` uses `{notam.eItem}` not `dangerouslySetInnerHTML`, and popups use JSX composition.
- Command injection — no shell-outs.

## Technical debt

Items grounded in the current source, ranked by maintainer-impact.

### Q-code subject extraction bug — high

In [src/lib/qcode-subjects.ts](../src/lib/qcode-subjects.ts):

```ts
export function getCategoryFromQLine(qLine: string): NotamCategory {
  const match = qLine.match(/\bQ([A-Z]{4})\b/i);
  if (!match) return 'other';

  const qCode = match[1].substring(1, 3); // Get 2nd & 3rd letters
  return getCategoryFromQCode(qCode);
}
```

`match[1]` is the 4 letters after `Q` (e.g. `FALC` for `QFALC`). The comment says "Get 2nd & 3rd letters" — meaning of the *full* Q-code — but `.substring(1, 3)` on `FALC` returns `AL`, not `FA`. Consequence: all subject-code lookups are off by one position; most NOTAMs fall through to `'other'` or get mis-categorized via the keyword fallback in `determineCategory`. Example confirmed in production responses: `QFALC` ("Facility - Aerodrome - Closed") ends up `category: "airspace"` because the keyword fallback matches `CLSD`.

Fix: `match[1].substring(0, 2)`. Add a unit test covering `QFALC → airport`, `QMRLC → runway`, `QWULW → airspace`.

### `ParsedNotam.id` undeclared — medium

[src/lib/notam-parser.ts:167](../src/lib/notam-parser.ts#L167) sets `id: notamId` on the returned object for backwards compatibility. `ParsedNotam` in [src/types/notam.ts](../src/types/notam.ts) does not declare this field, so `tsc --noEmit` reports errors in:

- [src/components/MapView.tsx](../src/components/MapView.tsx) — eight uses of `selectedNotam?.id === notam.id`.
- [src/components/NotamList.tsx](../src/components/NotamList.tsx) — six uses including React `key` and search filter.

Fix options: (a) add `id: string` to `NotamDetails` (one-line change); (b) migrate components to `notamId` and drop the alias.

### Fragile WAF detection heuristics — medium

`isWafChallenge(html)` greps for `<title>Error 100</title>`, and body-size thresholds (`DETAIL_MIN_BYTES = 4000`, `LIST_MIN_BYTES = 20000`) act as a secondary signal. If Radware changes the challenge page template (new title, different size), the scraper will stop detecting challenges — and silently return garbage to `parseNotamBlock`.

Fix: add a positive-signal check (e.g. response contains `tr[onclick^="rowClicked"]` for the list, `td.DetailsBlueLine b` for detail) before accepting the body.

### `determineCategory` keyword fallback is too loose — medium

In [src/lib/notam-parser.ts](../src/lib/notam-parser.ts):

```ts
if (text.includes('AIRSPACE') || text.includes('CLSD') || text.includes('AREA') || text.includes('BOUNDARY') || text.includes('EGYPT') || text.includes('LEBANON')) {
  return 'airspace';
}
```

`CLSD` appears in nearly every aerodrome-closed NOTAM, `AREA` in most procedural ones, and country names appear in many non-airspace NOTAMs. Combined with the Q-code subject bug, this fallback swallows a large fraction of NOTAMs into `airspace`.

Fix: remove this fallback once the Q-code bug is fixed, or narrow the keyword set.

### Coordinate-parser precedence is gated on `coords.length === 0` — low/medium

[src/lib/coord-parser.ts](../src/lib/coord-parser.ts) `extractCoordinatesFromBody` runs pattern 1a (PSN + decimal seconds), pattern 1b (PSN + integer seconds), pattern 1c (standalone prefix — `N..E..`), then compact/separated/DM fallbacks. Each fallback is gated `if (coords.length === 0)`. This means a body with *one* PSN-prefixed coord plus several standalone ones returns just the one — the standalone ones never run because `coords.length` is non-zero. Empirically rare in practice because real NOTAMs tend to use one format per message, but a landmine.

Fix: drop the gate on pattern 1c (standalones should always be picked up if the PSN ones found fewer than ~3), or dedupe after running all patterns.

### No logging / observability — low/medium

Scrape timing, jar mint/reuse decisions, per-rowID failure counts — none of this is logged. An operator cannot distinguish "115 NOTAMs always works, 114 sometimes fails" from "the WAF is escalating on Tuesdays" without adding instrumentation first.

### `runPool` result array can have holes on exceptions in early workers — low

`results[i] = { ok: true, value }` / `results[i] = { ok: false, error }` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) `runPool` are always assigned before the next iteration, so in practice there are no holes. But nothing prevents a future refactor from introducing one (e.g. rejecting the outer promise). Not a bug today; worth knowing before editing.

### Unused structured metadata on detail page — low

The detail page (`maiDetails.aspx`) has `<span id="LabelRow1..5">` elements holding pre-formatted "Location Indicator", "Valid From / To", "Created" etc. The scraper ignores these in favour of parsing the ICAO text block. That's fine when the text parses, but it leaves human-readable timestamps (e.g. `01/01/2026 06:40`) on the table that would let the app display dates even when the B/C line parse falls over.

### Puppeteer/Chromium download size — low

Installing `playwright` pulls ~150 MB of Chromium even when `IAA_COOKIE_JAR` is always provided (and Chromium is therefore never launched at runtime). Leaving it in keeps the cold-mint path as an escape hatch; removing it would shrink deployment artefacts by that amount.

### `.env.local.example` has stale cookie-name list — low

[.env.local.example](../.env.local.example) lists `__uzma`, `__uzmb`, `TS01e4f122`, `ASP.NET_SessionId`, `uzmxj`. Real Chrome jars contain ~17 cookies (see [docs/SCRAPING.md](SCRAPING.md) §Cookie-jar lifecycle). The example still works (the scraper accepts any subset), but is misleading.

## Suggested improvements

Grouped by priority. Each item maps to a debt entry above or names a concrete addition.

### Critical — fix before next non-trivial change

1. **Fix `getCategoryFromQLine`** — one-line `substring(0, 2)` change. Add a unit test.
2. **Add minimum test suite** — Jest/Vitest with fixtures for `parseNotamBlock`, `parseQLineCoordinate`, `extractCoordinatesFromBody`, and a recorded-HTTP test for `scrapeMobileNotams` (using `msw` or writing the fixtures manually). Target: ~15 tests covering the happy path for each of the above + the three known coord formats + the self-intersecting polygon case.
3. **Add `id: string` to `NotamDetails`** — settles the `tsc --noEmit` noise. Or remove the alias and migrate components.

### Medium — next refactor window

4. **Positive-signal WAF detection** — the list page is fine only if `tr[onclick^="rowClicked"]` parses; the detail page is fine only if `td.DetailsBlueLine b` has content. Invert the current "suspicious if empty/small/titled Error 100" check to "accepted if the expected DOM shape is present".
5. **Drop or tighten the `determineCategory` keyword fallback** — post Q-code fix, most NOTAMs no longer need it. Measure before removing: emit counts of which branch wins per scrape.
6. **Fold pattern 1c (standalone coords) into the always-run set** in `extractCoordinatesFromBody`, dedupe by coord string once at the end.
7. **Basic logging** — structured output at four points: `mintJarWithBrowser` entry/exit with duration, each `WafChallengeError` including URL and whether env/cached/minted jar was in use, `runPool` completion with (success count, WAF count, transient count), and `parseNotamBlock` null-returns with the first ~100 chars of the block.

### Nice to have

8. **Use the detail-page `LabelRow*` spans** as a second source for `effective`/`expires` when the B/C line parse yields `Invalid Date`.
9. **Add a `/api/notams?since=<iso>` param** that only returns NOTAMs with `effective > since`, to support polling.
10. **Persist the cookie jar to disk** so a cold restart doesn't need a fresh mint when the env var path is not in use. Trade-off: extra I/O, and the cookie is now on disk.
11. **Replace module-scoped `cachedJar` with a real TTL cache library** if the app ever scales to multiple concurrent scrapes — current `jarMintLock` works but the ergonomics degrade.
12. **Trim trailing `)` in the parser itself**, not in the popup formatter — the stray closing paren is currently cleaned by `trimTrailingParen` in [src/components/MapView.tsx](../src/components/MapView.tsx). Fixing it at parse time means `NotamDetail`, any future consumer, and `rawText` comparisons all see the same thing.
13. **Tighten `.env.local.example`** — include the full cookie-name list from [docs/SCRAPING.md](SCRAPING.md) or just say "paste the whole Cookie header verbatim".
14. **Harden self-intersection detection** to also downgrade to multipoint when the polygon's bounding box area is implausibly large (e.g. > 5° × 5° for an Israeli NOTAM) — catches the case where the vertex order happens to not self-intersect but still doesn't form a meaningful closed area.

### Out of scope / no action

- Migrating away from `react-leaflet` (v4) — no active pain point.
- Switching to the Next.js App Router's Server Components for the map — React-Leaflet requires client-side only.
- Adding a background refresh worker — contradicts the "always live, never stale" posture. Revisit only if upstream load becomes a problem.
