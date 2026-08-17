# Roadmap

Current testing state, security posture, known technical debt, and prioritized improvements. Everything here is grounded in the committed code — no items are invented or aspirational without being labeled as such.

## Contents
- [Shipped in v0.7.0](#shipped-in-v070)
- [Shipped in v0.6.0](#shipped-in-v060)
- [Shipped in v0.5.0](#shipped-in-v050)
- [Shipped in v0.4.0](#shipped-in-v040)
- [Fixed in v0.3.x](#fixed-in-v033)
- [Testing](#testing)
- [Security considerations](#security-considerations)
- [Technical debt](#technical-debt)
- [Suggested improvements](#suggested-improvements)

## Shipped in v0.7.0

UI/UX overhaul: house design system, resolvable overlapping NOTAMs, decoded NOTAM text, mobile detail sheet. Closes #49.

- **Tailwind 3.4 → 4.** `@tailwindcss/postcss` replaces the `tailwindcss` PostCSS plugin; `tailwind.config.ts` deleted (v4 auto-detects sources and the theme bridge replaces `theme.extend`). Migration surface was verified by grep and was small: zero `shadow-sm`/bare `shadow`/`bg-opacity-*`/bare-`ring`/uncoloured-`border` usages, so nothing regressed silently. The 5 `focus:outline-none` were removed in favour of the theme's single global `:focus-visible` ring.
- **House design system.** [src/app/theme/](../src/app/theme/) — `tokens.css` and `tailwind-bridge.css` copied verbatim from `skytutor-agent`, plus a local `notam-viz.css` overriding only `--accent*` and `--type-*`. Fonts are Fraunces / Assistant / Chivo Mono via `next/font/google`. `themeColor` is now `#f5f1e7` in [layout.tsx](../src/app/layout.tsx), [manifest.webmanifest](../public/manifest.webmanifest) and [capacitor.config.ts](../capacitor.config.ts), which previously disagreed with the header. The half-wired `prefers-color-scheme` block is gone — the theme is light-only by design. New deps: `lucide-react`, `clsx`, `tailwind-merge`.
- **Leaflet CSS is now layered.** `@import 'leaflet/dist/leaflet.css' layer(vendor)` with an explicit `@layer theme, base, vendor, components, utilities` declaration. In Tailwind v4 every emitted rule lives in a named layer and unlayered CSS beats all of them regardless of specificity or source order, so an unlayered Leaflet import would have won over every utility on map chrome.
- **Basemap warmed toward chart paper.** A CSS filter on `.leaflet-tile` (per-tile, not on `.leaflet-tile-pane` — filtering the pane re-runs the pass on every pan frame). Same tile URL, same attribution, same service-worker cache.
- **Overlapping NOTAMs are resolvable.** Leaflet delivers a click to exactly one shape (`Map._findEventTargets` walks the DOM ancestor chain; overlapping siblings are never ancestors), so a covered NOTAM was literally unclickable. Every NOTAM path is now `interactive: false` and one map-level handler runs [hit-test.ts](../src/components/map/hit-test.ts) `notamsAtPoint`, which delegates to Leaflet's own `_containsPoint` — correct for `L.Circle`'s Mercator-projected metric radius in a way a haversine test would not be, and it inherits stroke click-tolerance. 2+ hits opens [StackPicker](../src/components/map/StackPicker.tsx), which lists every NOTAM under the cursor **and** carries a prev/next stepper (arrow keys too) that walks map focus through the stack without dismissing the list — browsing drops the detail sheet to `peek` so the map and the picker both stay readable, while committing a row opens it at `half`. The card is clamped inside the map container and re-clamps on resize, since focusing a NOTAM opens the desktop panel and takes 380px off the map underneath it. Verified against live data: a click into the central cluster resolves 5 NOTAMs and stepping cycles all five.
- **Focus auto-dims the rest.** A dedicated `notams` pane plus classList toggles (`.is-dimmed`, `.is-focused`, `.is-selected`). Focus/selection are deliberately *not* in `pathOptions`: react-leaflet's `usePathOptions` compares by reference, so the old inline object literals called `setStyle()` on all ~114 shapes on every render. A focus change now costs two classList writes and zero React re-renders.
- **`MapView.tsx` split** into [src/components/map/](../src/components/map/) — 844 lines in one file became 9 focused modules, none over 200 lines. This was the deferred item under Technical debt; the deferral no longer applied once the click model and the detail surface both had to change inside it.
- **All Leaflet popups removed.** They were load-bearing in a non-obvious way: `Layer._openPopup` calls `stop(e)`, setting `_stopped` on the DOM event, which suppressed the map's own click handler. Deleting them without the `interactive: false` architecture would have made every shape click select and then immediately clear. Multipoint NOTAMs also minted one full popup *per point*. A single map-level tooltip now labels the focused NOTAM.
- **Decoded NOTAM text.** New [src/lib/notam/decode.ts](../src/lib/notam/decode.ts) produces a plain-language headline from the Q-code subject/condition (falling back to the app's category bucket, then a generic word), decodes the D-line schedule, and tokenises the E-item against an ICAO Doc 8400 contraction table. Expansions are **additive** — the original token is always what renders, with the expansion as an annotation — because a pilot cross-checking the official source has to see the same words. [NotamDetail](../src/components/detail/NotamDetail.tsx) leads with the decoded view and puts the raw NOTAM behind a collapsed toggle.
- **Detail surface replaced the popup.** [src/components/detail/](../src/components/detail/) — a draggable bottom sheet with peek/half/full detents on mobile, a docked 380px panel at `md`. Built on Pointer Events with pointer capture; no animation library. Portaled to `document.body`, which is what keeps Leaflet out of the gesture path (it binds handlers on its own container, so a non-descendant subtree never reaches them). The desktop panel takes width off the map rather than covering it, and a `ResizeObserver` calls `invalidateSize()` so `containerPoint` maths — which the hit test runs on — never goes stale.
- **Mobile and accessibility.** `h-screen` → `h-dvh`; the closed detail panel is `visibility: hidden` rather than only translated off-screen, so its controls leave the tab order (`aria-hidden` does not do that); new `.safe-top` utility on the fixed header (`viewportFit: 'cover'` plus a translucent status bar let the notch underlap it); `useClickOutside` switched from `mousedown` to `pointerdown`; panel gesture guards switched from mouse-only to `onPointerDown`; touch targets raised to ≥36–44px throughout; the layer panel now listens for `matchMedia` `change` instead of reading it once in a `useState` initializer. `scrollbar-thin` — a Tailwind plugin class with no plugin installed, and therefore a silent no-op since it was written — replaced with a real `@utility scrollbar-hairline`.
- **Sidebar rows carry information.** They previously showed `notam.title`, which is the two-letter Q subject glued to the first 80 raw characters (`"MR RWY 12/30 CLSD DUE TO WIP FROM…"`). Now: NOTAM id, active dot, expiry date, and the decoded headline.
- **Data freshness surfaced.** The API has always returned `fetchedAt` and nothing displayed it; the header now shows "updated Nh ago". The feed is a daily snapshot, so this matters.
- **Service worker no longer pins a stale shell.** `public/sw.js` read `self.__NOTAM_SW_VERSION__`, which **nothing ever defined** — the file is served verbatim from `public/` with no substitution step, so `SHELL_CACHE` was permanently `notam-shell-dev` and the precached `/` document was never invalidated across releases. The version now rides in the registration URL (`/sw.js?v=0.7.0`) and the worker reads it back out of its own location. Without this, returning PWA and iOS users would have kept booting the old shell and never seen this release. The generic fetch handler also now populates the cache — it previously only ever read, and `SHELL_ASSETS` lists no CSS or JS, so an offline cold start served the precached HTML pointing at bundles that were never stored.
- **Q-code table: `AR` added.** `QARLC` appears in the live feed and `AR` (ATS route) was missing from `SUBJECT_DESCRIPTIONS`, so those NOTAMs decoded to a generic fallback ("Navaid closed"). Description only — deliberately **not** added to `SUBJECT_CATEGORIES`, since changing a NOTAM's category moves it between filter buckets.
- **Unmatched trailing paren trimmed.** The IAA feed leaves a stray `)` on most E-items, so the detail sheet read `AD CLSD DUE WIP.)`. `eItemText` now drops it only when nothing opened it, so a legitimate trailing parenthetical survives. This was item 7 under "Nice to have"; fixed in `format.ts` rather than the parser so `rawText` stays byte-identical to the source.
- **User-location marker chrome.** `.notam-user-location-icon` was missing from the divIcon reset in `globals.css`, so the aircraft glyph had been rendering inside Leaflet's default white box with a grey border since v0.5.0.

### Still deferred

- **`scraper-mobile.ts` split into `src/lib/scraper/*`** — unchanged reasoning: the tests pin behaviour, but the split is a pure reorganization with no observable value. Defer until there's a second reason to touch the file.
- **Component/UI tests.** Still none. The map's decidable logic was extracted into `hit-test.ts` (unit-tested, no jsdom needed) specifically so the untestable part is just rendering. A Playwright smoke test remains the right next step.

### Found during this pass, not fixed

- **`src/lib/notam/airports.ts` is substantially wrong**, in names as well as coordinates. `LLIB` is labelled Eilat but sits at 31.938 / 35.166 (that is Jerusalem; Eilat is ~29.56 / 34.96). `LLER` is labelled Megiddo at 32.527 / 34.918, while v0.6.0 added LLER to the KML as **Ramon, 29.7233 / 35.0114**. Several entries cluster implausibly around 31.9 / 35.2. This table is the last-resort geometry fallback, so affected NOTAMs pin in the wrong place. Fixing it needs a verified aerodrome source and is a data-correctness issue, not a UI one — **it needs its own issue.** The decoder deliberately shows the ICAO code from the NOTAM's own A-line rather than a name from this table, so the overhaul does not amplify the bad data.
- **`userScalable: false` remains** in the viewport export. It is a WCAG 1.4.4 concern, but it was added deliberately in v0.5.2 to stop iOS WKWebView double-tap-zooming and rescaling text on rotation, and mobile Safari has ignored the hint since iOS 10 — so it only binds in the Capacitor shell. Left in place rather than silently reverting a deliberate fix; worth revisiting with a device in hand.

## Shipped in v0.6.0

UX pass: legal surface, unified map design, mobile chrome, airport database refresh, public docs pages, MIT license, app rebrand.

- **Startup disclaimer.** New [src/components/DisclaimerModal.tsx](../src/components/DisclaimerModal.tsx) — shown on every launch with a "not for operational use" notice, version footer, and inline Terms / Privacy buttons that open the existing `LegalModal` on top (z-index bumped to `z-[10030]` to stack above the disclaimer at `z-[10020]`). Wired into [src/components/HomePage.tsx](../src/components/HomePage.tsx); requires explicit Accept to dismiss — no localStorage gating, no backdrop-click / Escape dismissal.
- **Unified NOTAM map styling.** All NOTAM shapes (FIR-scale circles, regular circles, polygons, multipoints, single-point selection ring) now share one color and one set of opacity / stroke-weight constants defined at the top of [src/components/MapView.tsx](../src/components/MapView.tsx) (`NOTAM_COLOR`, `NOTAM_FILL_OPACITY*`, `NOTAM_STROKE_OPACITY`, `NOTAM_WEIGHT*`, `NOTAM_SELECTED_DASH`). Category-based coloring dropped on the map — `getCategoryColor` is no longer imported in MapView (still used by the sidebar list dot). Layer-panel swatches updated to match. Selection state = darker stroke + dashed outline + bumped fill opacity, consistent across all shape types. Active palette: `NOTAM_COLOR` red `#dc2626`, selected `#991b1b`.
- **iOS safe-area footer fix.** Sidebar `<aside>` in [src/components/NotamList.tsx](../src/components/NotamList.tsx) switched from `calc(100vh - 3rem)` → `calc(100dvh - 3rem)` (dynamic viewport unit tracks iOS browser chrome). New `.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }` utility in [src/app/globals.css](../src/app/globals.css) applied to the version + Terms/Privacy footer so it clears the home indicator on notched iPhones. Same utility used inside the disclaimer modal footer.
- **Airport KML refresh.** [public/kml/airports.kml](../public/kml/airports.kml) — added LLER (Ramon, ~29.7233°N / 35.0114°E); removed LLOV, LLHB, LLNV, LLHS, LLEK, LLPL, LLRD, LLES. Run `npx cap sync ios` to copy the updated KML into the iOS bundle.
- **Public docs pages.** Three statically-rendered routes for the App Store and the public web: [src/app/support/page.tsx](../src/app/support/page.tsx) (quick-start, filtering, route planner, exports, position layer, troubleshooting, contact), [src/app/privacy/page.tsx](../src/app/privacy/page.tsx) (renders `PRIVACY.md`), [src/app/terms/page.tsx](../src/app/terms/page.tsx) (renders `TERMS.md`). Shared shell in [src/components/DocsLayout.tsx](../src/components/DocsLayout.tsx); the markdown renderer was extracted from `LegalModal` into [src/lib/render-markdown.tsx](../src/lib/render-markdown.tsx) so the modal and the pages share one implementation. Sidebar footer in [src/components/NotamList.tsx](../src/components/NotamList.tsx) gained a Support link. The `/support` and `/privacy` URLs are what App Store Connect's Support URL and Privacy Policy URL fields point at.
- **App rebrand.** "NOTAM IL" → "NOTAM Visualizer" everywhere: [src/app/layout.tsx](../src/app/layout.tsx) metadata, [public/manifest.webmanifest](../public/manifest.webmanifest), [capacitor.config.ts](../capacitor.config.ts), iOS `Info.plist` (`CFBundleDisplayName` and the location-permission string), [ios-templates/Info.plist.additions.xml](../ios-templates/Info.plist.additions.xml), and the new docs pages. App Store Connect's "App Name" field is separate and must be updated in the web console.
- **License + author metadata.** [LICENSE](../LICENSE) added (MIT, © 2026 Orad Eldar) plus `"license": "MIT"` and `"author"` in [package.json](../package.json). GitHub now auto-detects MIT for the repo. Markdown legal docs (`TERMS.md`, `PRIVACY.md`) are unchanged — they retain their "All Rights Reserved" footer because they govern the deployed Service, not the source code.
- **Support contact hardened.** Personal email and the GitHub issues link are no longer exposed in the public Support page; contact is `orad@aero-logic.org` only.

## Shipped in v0.5.2

iOS WKWebView viewport hardening.

- **Lock page scale.** [src/app/layout.tsx](../src/app/layout.tsx) viewport now sets `maximumScale: 1`, `minimumScale: 1`, `userScalable: false`. WKWebView no longer double-tap-zooms or rescales on orientation change. Leaflet's own pinch/zoom is unaffected — the map still zooms.
- **Stop text auto-scaling.** [src/app/globals.css](../src/app/globals.css) adds `-webkit-text-size-adjust: 100%` (kills iOS' rotation text-resize) and `touch-action: manipulation` on `html, body` (removes the 300ms double-tap delay and its zoom side-effect).

## Shipped in v0.5.1

Export pipeline fix for the Capacitor iOS shell.

- **Export saves to device storage.** [src/lib/export/download.ts](../src/lib/export/download.ts) now detects `window.Capacitor.isNativePlatform()` and writes GPX / KML / exported HTML into the app's Documents directory via `@capacitor/filesystem`, then offers the saved file URL to the native share sheet. The `<a download>` path remains for desktop browsers.
- **PDF export no longer pops up.** [src/lib/export/pdf.ts](../src/lib/export/pdf.ts) renders into a hidden iframe and calls `iframe.contentWindow.print()` on desktop (replaces the blocked `window.open('_blank')`); on iOS it saves the self-contained HTML file via the same Filesystem path so users can open it in Safari or Files and print to PDF.
- **Files app visibility.** `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` added to [ios/App/App/Info.plist](../ios/App/App/Info.plist) and [ios-templates/Info.plist.additions.xml](../ios-templates/Info.plist.additions.xml) so exported files show up under **On My iPhone → NOTAM Visualizer** in the iOS Files app. No user-facing permission prompt — apps own their Documents sandbox on iOS.
- **New plugin.** `@capacitor/filesystem@^7` added to devDependencies; synced into the Xcode project.

## Shipped in v0.5.0

Mobile / App Store delivery pass. The web UI, parsers, and export pipeline are unchanged; everything new is additive.

- **PWA foundation.** [public/manifest.webmanifest](../public/manifest.webmanifest), [public/sw.js](../public/sw.js), and [src/app/register-sw.tsx](../src/app/register-sw.tsx). Service worker precaches the shell and network-first-with-fallback for `/api/notams` under a single cache key, so the last successful response survives airplane mode. Apple web-app meta (`apple-mobile-web-app-capable`, `viewport-fit=cover`) wired into [src/app/layout.tsx](../src/app/layout.tsx).
- **Device location + aircraft marker.** [src/hooks/useDeviceLocation.ts](../src/hooks/useDeviceLocation.ts) wraps `navigator.geolocation.watchPosition`. [src/components/UserLocationLayer.tsx](../src/components/UserLocationLayer.tsx) renders a rotating SVG DivIcon (heading-aware; falls back to a dot at zero speed) plus an accuracy circle. Wired into [src/components/MapView.tsx](../src/components/MapView.tsx) as an additive layer and toggled from the header in [src/components/HomePage.tsx](../src/components/HomePage.tsx). Fix stays in the webview — never transmitted anywhere.
- **iOS app via Capacitor.** [capacitor.config.ts](../capacitor.config.ts) + the `ios/` directory wrap a `next export` static bundle. Pinned to Capacitor `^7.x` because the repo targets Node 20 (v8 needs Node 22). Plugins: status-bar, splash-screen, share, haptics. Geolocation uses the browser API directly — no extra plugin needed.
- **Conditional static export.** [next.config.mjs](../next.config.mjs) emits `output: 'export'` only under `IOS_BUILD=1`. [scripts/ios-build.mjs](../scripts/ios-build.mjs) moves `src/app/api` aside for the export (route handlers aren't exported), runs icons, and `cap sync`s. The Vercel SSR build is untouched.
- **App icon.** [public/icons/source/notam-icon.svg](../public/icons/source/notam-icon.svg) — 1024×1024 caution triangle over a compass rose on navy. [scripts/generate-icons.mjs](../scripts/generate-icons.mjs) rasterises via `sharp` into the PWA set (180/192/512/1024) and the unified iOS AppIcon (1024, no alpha, as Apple requires).
- **App Store compliance.** [ios-templates/Info.plist.additions.xml](../ios-templates/Info.plist.additions.xml) and [ios-templates/PrivacyInfo.xcprivacy](../ios-templates/PrivacyInfo.xcprivacy) applied to the scaffolded iOS project: `NSLocationWhenInUseUsageDescription`, `ITSAppUsesNonExemptEncryption=false`, required-reason API declarations. Privacy nutrition label = "Data Not Collected".
- **CORS on `/api/notams`.** [src/app/api/notams/route.ts](../src/app/api/notams/route.ts) now sends `Access-Control-Allow-Origin: *` on every code path plus an `OPTIONS` handler. Capacitor's `capacitor://localhost` origin is cross-origin; without this the iOS shell could not fetch the feed. Safe — the endpoint is read-only GET with no cookies or auth.
- **iOS docs.** [docs/IOS.md](IOS.md) captures the install line, the one remaining Xcode GUI step (adding `PrivacyInfo.xcprivacy` to the app target), and the App Store release checklist.

## Shipped in v0.4.0

Production-readiness pass. Correctness fixes are pinned by the Vitest suite; infrastructure additions (logger, rate-limit, click-outside hook) are exercised by the build + typecheck + lint gates but don't yet have dedicated tests — see [docs/TESTING.md](TESTING.md) for the coverage gap.

- **Q-code subject extraction fixed.** `getCategoryFromQLine` in [src/lib/qcode-subjects.ts](../src/lib/qcode-subjects.ts) now calls `substring(0, 2)` on the 4-letter code (e.g. `FALC` → `FA`), so `QFALC` maps to `airport`, `QMRLC` to `runway`, `QRDCA` to `military`, etc. Pinned by [src/lib/qcode-subjects.test.ts](../src/lib/qcode-subjects.test.ts) and reproduced end-to-end in [src/lib/notam-parser.test.ts](../src/lib/notam-parser.test.ts).
- **`determineCategory` keyword fallback tightened.** Dropped `CLSD`, `AREA`, `BOUNDARY`, `EGYPT`, `LEBANON` — kept only strong airspace signals (`AIRSPACE`, `WARNING AREA`, `TEMPORARY RESERVED AREA`, `ATS ROUTE`). The Q-code map now does the primary classification; the fallback is a safety net for NOTAMs with missing/unknown Q-codes.
- **Coordinate parser: Pattern 1c is no longer gated on `coords.length === 0`.** Mixed-format NOTAMs (one PSN coord + several standalone `N..E..` coords) now return a polygon instead of a lone point. Added a lat/lon dedupe pass so different patterns can't emit the same coord twice.
- **WAF positive-signal detection.** `isListPageValid` / `isDetailPageValid` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) now require the expected DOM markers (`tr[onclick="rowClicked"]` / `DetailsBlueLine`). A silently-broken Radware challenge that doesn't carry the `Error 100` title is caught too.
- **Vitest test suite.** 52 tests across five files pinning the parsers, coord extraction, Q-code mapping, route filter, and scraper validators. Fixture-based; co-located with the code they test.
- **CI gate.** [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs `lint`, `typecheck`, `test` on every PR and push to `main`. ESLint set up with the Next strict preset plus `@typescript-eslint/no-explicit-any: error` and a `no-console` warning. `typecheck` script added (`tsc --noEmit`). `engines.node` pinned to `>=20`.
- **Config centralized.** URLs, KV key, and cache windows moved to [src/lib/config.ts](../src/lib/config.ts). The scraper, the `/api/notams` route, and the GitHub Action scrape script now import from one place.
- **Structured logger.** [src/lib/log.ts](../src/lib/log.ts) — one JSON line per event. Four instrumented points in the scraper (jar mint, WAF challenge, list fetched, run completion) plus per-request logging on `/api/notams` (served, rate-limited, 503 empty-KV, 500 error).
- **Rate limit on `/api/notams`.** Sliding window of 30 req/min per client IP via `@upstash/ratelimit`, backed by the existing Upstash Redis credentials. Fails open if the limiter backend is unreachable — the NOTAM payload is more valuable than strict enforcement. Returns 429 + `Retry-After` + `X-RateLimit-*` headers when the bucket is exhausted.
- **Escape-helper dedupe.** `escapeHtml`/`escapeXml` in [src/lib/export/download.ts](../src/lib/export/download.ts) now share a private helper — same output, half the duplication.
- **`useClickOutside` hook.** [src/lib/use-click-outside.ts](../src/lib/use-click-outside.ts) — single implementation consumed by `ExportMenu`, `NotamFilterBar` (sort + time popovers), and `RouteInput` autocomplete. Four copies of the `mousedown` boilerplate collapsed to one hook.

### Intentionally deferred

- **`MapView.tsx` (810 lines) split into `src/components/map/*`** — planned, not executed. Refactors of Leaflet-bound render code have high regression risk without a browser-driven smoke test, and the current file works. Will revisit under a dedicated refactor branch.
- **`scraper-mobile.ts` (409 lines) split into `src/lib/scraper/*`** — same reasoning; the tests pin behavior, but the split is a pure reorganization with no observable value to users. Defer until there's a second reason to touch this file.

### Known security finding — requires separate action

- **Next.js 14.2.35 carries three open CVEs** (see `npm audit`): Image Optimizer DoS (`GHSA-9g9p-9gw9-jx7f`, moderate), HTTP request deserialization DoS (`GHSA-h25m-26qc-wcjf`, high), rewrite-based request smuggling (`GHSA-ggv3-7p47-pfv8`, moderate). Latest Next 14.x is 14.2.35; the patch is in 15.5.10+. **The Next 14 → 15 upgrade is a breaking-change migration and is out of scope for this review.** Flag it on the next major work cycle.

## Fixed in v0.3.3

- **Map area could shift upward and be clipped by the fixed header.** The map wrapper was `position: absolute top-12 bottom-0` inside the page root, which allowed its top/bottom offsets to resolve inconsistently when Leaflet called `invalidateSize` or the viewport re-measured. Switched to `position: fixed top-12 left-0 right-0 bottom-0 md:left-80` — anchored directly to the viewport, no ancestor relayout can move it.

## Fixed in v0.3.2

- **Header could disappear on mobile, making the drawer unreachable.** The app header is now `position: fixed top-0 z-[10001]`, pinned above the drawer (which stays at `z-[9999]`). The ☰ hamburger is always tappable regardless of any viewport / browser-chrome quirk.
- **Drawer layout consolidated.** On both mobile and desktop the drawer now sits at `top-12`, `height: calc(100vh - 3rem)` — one code path, no mobile-vs-desktop fork.
- **Removed the drawer's own mobile close strip** (the "NOTAMs ✕" row). Redundant now that the header's always-visible hamburger toggles open and close; one less piece of chrome at the top of the drawer.

## Fixed in v0.3.1

- **Mobile drawer was invisible below the app header.** The NotamList drawer (`z-[60]` previously) was being painted under Leaflet's own panes and controls, which use z-indexes up to 1000. Bumped the drawer to `z-[9999]` and the backdrop to `z-[9000]`, and rendered both via `createPortal` to `document.body` so no ancestor containing block (flex row, `overflow-hidden`, etc.) can clip them. Explicit `height: 100vh` inline style + `md:!h-[calc(100vh-3rem)]` ensures the aside is full viewport on mobile and header-offset on desktop. Backdrop now starts at `top-12` so a ghost tap on the hamburger position doesn't accidentally close the drawer.

## Completed in v0.3.0

Shipped since v0.2.0 (2026-04):

- **Data ops.** Daily GitHub Action (`.github/workflows/scrape.yml`) runs `scripts/scrape.ts` → parses → writes a single `notams:latest` key to Vercel KV. The Next.js API reads from KV with `s-maxage=3600, stale-while-revalidate=86400`. Upstream load is now 1 list + ~114 detail fetches per 24 h instead of per user request.
- **Touch-first UI.** Sidebar becomes a slide-in drawer on `<md` with a hamburger in the header and backdrop-tap dismiss. Removed the heavy `NotamDetail` card — the Leaflet popup is the sole detail surface. Click-to-deselect on map background; ESC clears selection.
- **Simplified sidebar.** Filter state lifted out of `NotamList` into [`src/lib/use-notam-filter.ts`](../src/lib/use-notam-filter.ts). New [`NotamFilterBar`](../src/components/NotamFilterBar.tsx) with search + count + sort popover + category chips + global time-window popover (`Now / 2h / 24h / 7d / custom`). Rows collapsed to one-line (dot · ID · title). Selection strip shows only count + Clear.
- **Route planner.** New [`RouteInput`](../src/components/RouteInput.tsx) with autocomplete over all four bundled KMLs. [`src/lib/route-filter.ts`](../src/lib/route-filter.ts) resolves tokens → `RoutePoint[]`, runs haversine + point-to-segment distance checks, intersects NOTAM altitude bands (via `parseQLineAltitudeFt` in [`src/lib/altitude-parse.ts`](../src/lib/altitude-parse.ts)). Corridor is 1 km wide; single-point routes degrade to a 1 km radius circle. Polyline + corridor rendered on the map.
- **Aviation reference layers.** Four bundled KMLs (`public/kml/airports.kml`, `navaids.kml`, `vfr_waypoints.kml`, `ifr_waypoints.kml`) parsed by [`src/lib/kml-layer.ts`](../src/lib/kml-layer.ts), rendered as Jeppesen-style SVG symbols via [`src/lib/aviation-icons.ts`](../src/lib/aviation-icons.ts) with permanent name tooltips. Layer panel gained a Reference section whose legend uses the same SVG symbols as the markers.
- **Export UX.** [`ExportMenu`](../src/components/ExportMenu.tsx) generalized (`notams` prop, `variant: 'pill' | 'compact'`) and slotted into the filter bar as a ⬇ pill. Scope follows selection: if any rows are checked (list or map), export emits only those; otherwise it falls back to the current filtered view. PDF layout trimmed to essentials (ID, validity, location, altitude, schedule, E-item) — Q-code, FIR, geometry, traffic, and scope removed per user preference.

Removed in this release: the Select-mode toggle, `RectangleSelector`, and the large `NotamDetail` card.



## Testing

**Vitest suite in place.** Config at [vitest.config.ts](../vitest.config.ts); see [docs/TESTING.md](TESTING.md) for conventions. 52 tests across the library modules; zero UI/component tests today.

Coverage matrix:

| Layer | File | What it covers |
|---|---|---|
| Unit — `notam-parser.ts` | [src/lib/notam-parser.test.ts](../src/lib/notam-parser.test.ts) | `parseNotamBlock` for PERM, multi-line E-item, same-line mobile layout, missing Q-line, garbage input; category is `airport` for `QFALC` (pins the Q-code fix). |
| Unit — `coord-parser.ts` | [src/lib/coord-parser.test.ts](../src/lib/coord-parser.test.ts) | `parseCoordinatePair`, `parseQLineCoordinate` (DMS+separator, DM-compact, no-radius), `extractCoordinatesFromBody` (PSN, standalone, mixed, empty), dedupe. |
| Unit — `qcode-subjects.ts` | [src/lib/qcode-subjects.test.ts](../src/lib/qcode-subjects.test.ts) | `getCategoryFromQCode` + `getCategoryFromQLine` case sensitivity, real Q-codes (`QFALC`, `QMRLC`, `QWULW`, `QRDCA`), unknown fallback. |
| Unit — `route-filter.ts` | [src/lib/route-filter.test.ts](../src/lib/route-filter.test.ts) | `parseRouteInput` delimiters, `haversineNm`, `pointToSegmentDistanceNm`, `notamMatchesRoute` (on/off corridor + altitude band), `notamOverlapsWindow`. |
| Unit — `scraper-mobile.ts` | [src/lib/scraper-mobile.test.ts](../src/lib/scraper-mobile.test.ts) | `isListPageValid` / `isDetailPageValid` on a real fixture + a WAF Error-100 page + undersized bodies. |

**Remaining coverage gaps (deliberately out of scope for v0.4.0):**

- Component/UI tests — MapView, NotamList, filter bar. Requires jsdom + React Testing Library. Defer until a Leaflet-aware component test harness is worth the setup cost.
- E2E Playwright smoke test against `localhost:3000`. Defer until there's a second reason to stand up a preview-style runner.
- Integration test for `scrapeMobileNotams` end-to-end (listed→detailed→parsed with mocked `fetch`). Happy path is covered by the pure validators; full state-machine pin would also need network-mocking infrastructure.

## Security considerations

- **AuthN/AuthZ:** none. `GET /api/notams` is open to anyone who can reach the server. Acceptable for public data, but if this is ever deployed behind a login gate, the route needs its own checks.
- **Rate limiting:** 30 req/min per IP via `@upstash/ratelimit`, backed by the existing Upstash Redis (see [src/lib/rate-limit.ts](../src/lib/rate-limit.ts)). Fails open if the limiter backend is unreachable. Shipped in v0.4.0.
- **Next.js CVEs:** v14.2.35 (current) carries three open advisories; the fixes are in v15.5.10+. Migrating to Next 15 is a breaking change deferred out of this pass. See the v0.4.0 release notes for the specific advisories.
- **Session token in env:** `IAA_COOKIE_JAR` carries a live Radware-issued session token that represents a human browser's challenge pass. Leaking it lets anyone make requests that impersonate that session until it expires (~hours to a day). Mitigations:
  - `.gitignore` includes `.env*.local` (confirmed).
  - `.env.local.example` contains only placeholder `…` values.
  - No code logs the full cookie jar. `cookieHeader(jar)` output is not printed anywhere.
- **Playwright runtime:** launches Chromium headless with `--disable-blink-features=AutomationControlled`, `--disable-features=IsolateOrigins,site-per-process`, and `navigator.webdriver` patched. These reduce fingerprint signal to Radware; they do not reduce local security. Chromium runs in the Node process's UID; do not run the server as root.
- **No input from user:** `/api/notams` takes no query parameters or body. Nothing to sanitize.
- **CORS:** default Next.js behaviour (no CORS headers). Browsers can only call it from the same origin.
- **External content:** map tiles come from `tile.openstreetmap.org` via the URL in [src/components/map/MapView.tsx](../src/components/map/MapView.tsx). Tiles are fetched by the client, not the server.

Not-an-issue-here:

- SQL injection — no SQL.
- XSS through `eItem` — React escapes text by default; `NotamDetail` renders decoded tokens as JSX text nodes, never `dangerouslySetInnerHTML`. The one `dangerouslySetInnerHTML` in the tree is `LayerPanel`'s reference-layer legend, fed from the hardcoded SVG strings in `aviation-icons.ts` — no user or feed input reaches it.
- Command injection — no shell-outs.

## Technical debt

Items still open, grounded in current source, ranked by maintainer-impact.

### Monolithic scraper file — medium

`MapView.tsx` was split in v0.7.0 (see Shipped) — the deferral stopped applying once the click model and the detail surface both had to change inside it.

[src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts) is ~450 lines and the planned `src/lib/scraper/*` split is still deferred, with the original reasoning intact: the test suite pins its observable behavior, and a pure reorganization ships regression risk with zero user-visible value. Revisit when there's a second reason to edit it.

### `runPool` result array can have holes on exceptions in early workers — low

`results[i] = { ok: true, value }` / `results[i] = { ok: false, error }` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) `runPool` are always assigned before the next iteration, so in practice there are no holes. But nothing prevents a future refactor from introducing one (e.g. rejecting the outer promise). Not a bug today; worth knowing before editing.

### Unused structured metadata on detail page — low

The detail page (`maiDetails.aspx`) has `<span id="LabelRow1..5">` elements holding pre-formatted "Location Indicator", "Valid From / To", "Created" etc. The scraper ignores these in favour of parsing the ICAO text block. That's fine when the text parses, but it leaves human-readable timestamps (e.g. `01/01/2026 06:40`) on the table that would let the app display dates even when the B/C line parse falls over.

### Puppeteer/Chromium download size — low

Installing `playwright` pulls ~150 MB of Chromium even when `IAA_COOKIE_JAR` is always provided (and Chromium is therefore never launched at runtime). Leaving it in keeps the cold-mint path as an escape hatch; removing it would shrink deployment artefacts by that amount.

### `.env.local.example` has stale cookie-name list — low

[.env.local.example](../.env.local.example) lists `__uzma`, `__uzmb`, `TS01e4f122`, `ASP.NET_SessionId`, `uzmxj`. Real Chrome jars contain ~17 cookies (see [docs/SCRAPING.md](SCRAPING.md) §Cookie-jar lifecycle). The example still works (the scraper accepts any subset), but is misleading.

## Suggested improvements

Remaining items, grouped by priority.

### High

1. **Upgrade Next.js** off v14.2.35 to v15.5.10+ to close the three open CVEs (see v0.4.0 security note). Breaking-change migration; plan as a dedicated branch.
2. **Fix `src/lib/notam/airports.ts`** — wrong names and coordinates in the last-resort geometry fallback, so affected NOTAMs pin in the wrong place. Needs a verified aerodrome source. See "Found during this pass" under v0.7.0.
3. **Add a Playwright smoke test.** `MapView.tsx` is split and `hit-test.ts` is unit-tested, but nothing automated exercises the rendered map. The v0.7.0 work was verified by driving Chromium by hand; that should be a committed test.

### Nice to have

3. **Use the detail-page `LabelRow*` spans** as a second source for `effective`/`expires` when the B/C line parse yields `Invalid Date`.
4. **Add a `/api/notams?since=<iso>` param** that only returns NOTAMs with `effective > since`, to support polling.
5. **Persist the cookie jar to disk** so a cold restart doesn't need a fresh mint when the env var path is not in use. Trade-off: extra I/O, and the cookie is now on disk.
6. **Replace module-scoped `cachedJar` with a real TTL cache library** if the app ever scales to multiple concurrent scrapes — current `jarMintLock` works but the ergonomics degrade.
8. **Tighten `.env.local.example`** — include the full cookie-name list from [docs/SCRAPING.md](SCRAPING.md) or just say "paste the whole Cookie header verbatim".
9. **Harden self-intersection detection** to also downgrade to multipoint when the polygon's bounding box is implausibly large (e.g. > 5° × 5° for an Israeli NOTAM).

### Out of scope / no action

- Migrating away from `react-leaflet` (v4) — no active pain point.
- Switching to Server Components for the map — React-Leaflet requires client-side only.
- Adding a background refresh worker — contradicts the "always live, never stale" posture.
