# notam-viz

Interactive map viewer for Israeli Airports Authority (IAA) NOTAMs. Scrapes the public IAA mobile AeroInfo endpoint, parses ICAO-format NOTAM records, decodes Q-codes to categories, extracts geometry from Q-line and body text, and renders everything on a Leaflet map.

## What it does

- Fetches the list of currently-published NOTAMs from `https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx`.
- For each listed NOTAM, fetches the detail page and reconstructs the full ICAO text block.
- Parses each block into a structured `ParsedNotam` with decoded Q-code, typed geometry (`point | circle | polygon | multipoint`), altitude limits, effective/expiry timestamps, and category.
- Serves the result from `GET /api/notams`.
- Renders the result on a Leaflet map with layer toggles, per-category colour, click-through stacking (smaller shapes on top), and popups showing time validity, altitude, scope, and decoded Q-code.

## What it is not

- Not a certified aeronautical product. Do not use for flight planning.
- Not a rewrite of the IAA source — it is a read-only client.
- No database, no auth, no user accounts, no background scheduler — every `GET /api/notams` call fetches live from the upstream mobile site.

## Quickstart

Prerequisites: Node ≥ 20, `npm`, a clean IP that hasn't been flagged by Radware Bot Manager (see [docs/SCRAPING.md](docs/SCRAPING.md)), and a real Chrome session for one-time cookie extraction.

```bash
npm install
npx playwright install chromium      # one-time, only if you'll use browser-minted cookies
```

Most of the time the upstream WAF will not let a headless browser through from a fresh machine. The reliable path is to paste cookies from your own Chrome session into `.env.local`:

```bash
cp .env.local.example .env.local
# follow the step-by-step in docs/OPERATIONS.md §Cookie-jar refresh
```

Then:

```bash
npm run dev
# open http://localhost:3000 — the app fetches /api/notams on load
```

First API call takes ~15–25 s (1 list + ~114 detail fetches with jittered concurrency 4). Subsequent calls hit the Next.js response cache (`Cache-Control: public, max-age=300`).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, modules, end-to-end request flow, data flow diagram.
- [docs/SCRAPING.md](docs/SCRAPING.md) — how the Radware WAF bypass works: mobile endpoint, cookie jar, Playwright mint, retry strategy.
- [docs/REFERENCE.md](docs/REFERENCE.md) — `ParsedNotam` shape, geometry union, Q-code decoder tables, `GET /api/notams` contract with example response.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — env vars, step-by-step cookie refresh, runtime model, error handling, logging.
- [docs/ROADMAP.md](docs/ROADMAP.md) — testing state, security posture, known technical debt, prioritized improvements.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server, default port 3000, reads `.env.local`. |
| `npm run build` | Next.js production build. |
| `npm run start` | Serve the built app. |
| `npm run lint` | `next lint`. |

No test runner is configured. See [docs/ROADMAP.md](docs/ROADMAP.md) §Testing.

## Source of truth

Upstream: `https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx`. The app is a thin client of this one endpoint. If the mobile DOM structure changes, the cheerio selectors in [src/lib/scraper-mobile.ts](src/lib/scraper-mobile.ts) will need updating.
