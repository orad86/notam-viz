# Project structure

A short orientation map. Read this first if you are new. The deep-dives are [ARCHITECTURE.md](ARCHITECTURE.md), [OPERATIONS.md](OPERATIONS.md), [SCRAPING.md](SCRAPING.md), [TESTING.md](TESTING.md), [REFERENCE.md](REFERENCE.md).

## Top-level tree

```
src/        Application source.
tests/      Vitest tests; mirrors src/lib/. Fixtures under tests/fixtures/.
docs/       Architecture, operations, testing, scraping notes.
scripts/    Build helpers (icons, iOS) and the GitHub Actions scrape entry.
public/     Static assets served as-is (manifest, sw.js, KML overlays, leaflet/).
ios/        Capacitor iOS shell (the iOS app). Decoupled from the web build.
```

## `src/` tree

```
src/
├── app/            Next.js App Router routes (page.tsx, layout.tsx, api/notams/route.ts, …).
│   └── theme/      Design tokens. tokens.css + tailwind-bridge.css are copied
│                   VERBATIM from skytutor-agent; only notam-viz.css may diverge.
├── components/     React UI components (PascalCase.tsx, all client-side).
│   ├── map/        Leaflet map. See docs/ARCHITECTURE.md for the click model.
│   └── detail/     NOTAM detail: bottom sheet on mobile, docked panel at md.
├── hooks/          Custom React hooks (useThing.ts, camelCase).
├── lib/            Non-React logic. Three domains: notam/, export/, server/.
└── types/          Shared TypeScript types (notam.ts).
```

## `src/lib/` domains

```
src/lib/
├── notam/          Everything NOTAM-domain.
│   ├── parser.ts           Parse a raw NOTAM block into a ParsedNotam.
│   ├── coord-parser.ts     DMS/DM coordinate extraction.
│   ├── qcodes.ts           ICAO Q-code subject + condition tables and decoder.
│   ├── altitude.ts         User-input and Q-line altitude parsing.
│   ├── airports.ts         Israeli airport / FIR coordinate lookup.
│   ├── format.ts           Display formatters (date, altitude range, scope, …).
│   ├── decode.ts           Plain-language decoding: headline + ICAO contractions.
│   ├── geometry.ts         Pure NOTAM-geometry math (bbox area, …).
│   └── route-filter.ts     Route corridor + altitude band matching.
├── export/         Selection → file-format builders.
│   ├── pdf.ts              HTML cards rendered into a printable PDF.
│   ├── kml.ts              Google-Earth KML.
│   ├── gpx.ts              GPS waypoint format.
│   └── download.ts         Browser/iOS download trigger; small XML/HTML escapes.
└── server/         Server-only infrastructure. NEVER import these from a client component.
    ├── config.ts           IAA URLs, KV keys, cache windows. Single source of truth.
    ├── kv.ts               Vercel KV reads/writes for cached NOTAMs.
    ├── log.ts              Structured JSON log() helper.
    ├── rate-limit.ts       Upstash rate-limit guard for the public API.
    └── scraper-mobile.ts   Playwright-driven IAA mobile scraper (run by scripts/scrape.ts in CI).
```

Top-level files in `src/lib/` (no domain home): `aviation-icons.ts`, `cn.ts` (the `clsx` + `tailwind-merge` helper), `kml-layer.ts` (browser-side KML fetch), `render-markdown.tsx`, `version.ts`.

## `src/components/map/` tree

```
map/
├── MapView.tsx         Container, panes, layer composition.
├── NotamShapes.tsx     The four geometry renderers. All non-interactive.
├── MapInteractions.tsx Map-level click, focus highlight, fly-to, focus label.
├── hit-test.ts         notamsAtPoint / pathElements. Pure, unit-tested.
├── LayerPanel.tsx      Geometry + reference layer toggles.
├── StackPicker.tsx     Disambiguation list for overlapping NOTAMs.
├── SelectionToolbar.tsx
├── constants.ts        Frozen pathOptions, pane name, layer metadata.
└── leaflet-setup.ts    Typed lazy `require('leaflet')`.
```

## `tests/` tree

```
tests/
├── fixtures/       Real HTML / NOTAM blocks captured from past scrapes.
├── map/            Mirrors src/components/map/. (Pure modules only — no UI tests.)
├── notam/          Mirrors src/lib/notam/.
└── server/         Mirrors src/lib/server/. (Currently scraper validators only.)
```

One `*.test.ts` per source module. See [TESTING.md](TESTING.md) for the coverage matrix and conventions.

## Conventions

- **File naming**: `kebab-case.ts` for non-component files; `PascalCase.tsx` for React components; `useThing.ts` (camelCase) for hooks.
- **Imports**: always use the `@/` alias (configured in [tsconfig.json](../tsconfig.json)). No long relative paths like `../../../foo`.
- **Server-only rule**: anything under `src/lib/server/` must never be imported by a client component (`'use client'`). It runs on Node, reads env vars, talks to KV and the scraper.
- **No new deps** without a specific reason — this app is deliberately small.
- **Comments**: explain the WHY (constraints, gotchas, regression notes). Don't restate WHAT the code does.

## Where does my new file go?

A 5-step decision tree:

1. Is it a React component (`'use client'`, returns JSX)? → [src/components/](../src/components/) (`PascalCase.tsx`).
2. Is it a React hook (returns state, uses `useEffect` / `useState`)? → [src/hooks/](../src/hooks/) (`useThing.ts`).
3. Is it server-only (Node APIs, env vars, KV, scraper)? → [src/lib/server/](../src/lib/server/).
4. Is it about NOTAMs (parsing, formatting, filtering, geometry)? → [src/lib/notam/](../src/lib/notam/).
5. Does it produce an export file (PDF / KML / GPX / …)? → [src/lib/export/](../src/lib/export/).

If none of the above fits cleanly, leave it at the top of `src/lib/` and discuss in the PR.
