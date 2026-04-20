# notam-viz

Interactive map viewer for Israeli Airports Authority (IAA) NOTAMs. A GitHub Action scrapes the public IAA mobile AeroInfo endpoint once a day, parses ICAO NOTAM records, decodes Q-codes, and stores the result in Vercel KV. The Next.js app reads that snapshot and renders every NOTAM on a Leaflet map with route-aware filtering, Jeppesen-style reference layers, and PDF/GPX/KML export.

## Features

- **Map + list** stay in sync: search, category chips, and time-window filter affect both simultaneously.
- **Route planner.** Type waypoint/airport/navaid codes (autocomplete from four bundled KMLs), set an altitude and a time window — the app shows only NOTAMs affecting that flight and draws the route + ±1 km corridor. Single-point routes work too (becomes a 1 km-radius area check).
- **Time window filter** (`Now / 2h / 24h / 7d / custom`) applies globally to the list and map.
- **Reference layers.** Airports (LLBG, LLHA, …), navaids, VFR waypoints, IFR intersections rendered with Jeppesen-style SVG symbols and permanent name labels.
- **Touch-first UI.** Collapsible mobile sidebar (hamburger drawer), popup-first NOTAM detail (no heavy detail card), click-to-deselect on the map, ESC key clears selection, Shift-click for multi-select on desktop, popup checkbox on touch.
- **Export** the current view (filter + route applied) to PDF, GPX, or KML from an always-visible pill in the filter bar. No multi-select required.
- **Data ops.** Daily GitHub Action scrapes IAA → Upstash Redis. API route reads with `s-maxage=3600, stale-while-revalidate=86400`, rate-limited at 30 req/min per IP.
- **Tested and gated.** Vitest suite pinning parsers, coord extraction, Q-code mapping, route filter, and scraper validators. CI runs `lint`, `typecheck`, `test` on every PR.

## What it is not

- Not a certified aeronautical product. Do not use for flight planning.
- Not a rewrite of the IAA source — it's a read-only scraper + viewer.
- No user accounts, no auth, no per-user state.

## Quickstart

Prerequisites: Node ≥ 20, `npm`, and a Vercel KV (Upstash Redis) store you can read from locally.

```bash
git clone <repo>
cd notam-viz
npm install
cp .env.local.example .env.local
```

Fill `.env.local` with your Vercel KV credentials plus (for the scraper) a fresh `IAA_COOKIE_JAR`:

```
KV_REST_API_URL=https://<store>.upstash.io
KV_REST_API_TOKEN=<write token>
IAA_COOKIE_JAR=<one-line Cookie header from a logged-in Chrome session>
```

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for how to harvest cookies and provision KV.

Run the app:

```bash
npm run dev
# http://localhost:3000 — reads /api/notams from KV on load
```

If KV is empty (new store), trigger a scrape once:

```bash
# One-shot local scrape (writes to KV):
npx tsx scripts/scrape.ts

# Or via GitHub Actions:
gh workflow run "Daily Scrape"
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, modules, data flow (scraper → KV → API → UI).
- [docs/SCRAPING.md](docs/SCRAPING.md) — IAA mobile endpoint, Radware WAF bypass, cookie jar, retry strategy.
- [docs/REFERENCE.md](docs/REFERENCE.md) — `ParsedNotam` shape, geometry union, Q-code decoder tables, `GET /api/notams` contract.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — env vars (KV + cookie jar), daily scrape workflow, deployment notes, cookie-jar refresh procedure.
- [docs/TESTING.md](docs/TESTING.md) — Vitest setup, fixtures, conventions, coverage gaps.
- [docs/ROADMAP.md](docs/ROADMAP.md) — v0.4.0 release notes, testing state, security posture, known technical debt.
- [CLAUDE.md](CLAUDE.md) — agent-facing guidance for editing this repo.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on port 3000; reads `.env.local`. |
| `npm run build` | Next.js production build. |
| `npm run start` | Serve the built app. |
| `npm run lint` | `next lint` with the strict `@typescript-eslint` rules from `.eslintrc.json`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode for local development. |
| `npm run scrape` | `tsx scripts/scrape.ts` — one-shot scrape → KV (also what the GitHub Action runs). |

## Source of truth

Upstream: `https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx`. The scraper is the only consumer of this endpoint; the app reads its own KV snapshot. If the mobile DOM structure changes, the selectors in [src/lib/scraper-mobile.ts](src/lib/scraper-mobile.ts) need updating.
