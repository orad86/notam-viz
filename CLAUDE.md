# Agent notes — notam-viz

Concise guidance for agents editing this repo. Full context lives in `docs/`.

## Before changing parsers

`src/lib/notam/parser.ts`, `src/lib/notam/coord-parser.ts`, and `src/lib/notam/qcodes.ts` are the highest-risk files. Every regex or mapping change needs a fixture-backed test in the matching `*.test.ts` file first. The Q-code substring bug (pinned in `qcodes.test.ts`) hid for multiple versions because nothing compared `determineCategory('LLLL/QFALC/…')` against `'airport'` — don't let that recur.

## URLs, KV keys, cache windows

Single source of truth: `src/lib/server/config.ts`. Don't re-inline the IAA base URL, `notams:latest`, or the 3600/86400 cache numbers anywhere else.

## Logging

Use `log(level, event, fields)` from `src/lib/server/log.ts`. Events are dotted strings (`scrape.list.fetched`, `api.notams.served`). JSON lines go to stdout (info) or stderr (warn/error); Vercel and GitHub Actions both surface them inline.

## Rate limiting

`/api/notams` is behind `@upstash/ratelimit` (30 req/min per IP). Helper in `src/lib/server/rate-limit.ts`. Fail-open on backend unavailability — NOTAMs are more valuable than strict enforcement.

## Testing harness

Vitest. `npm run test` locally; CI workflow is `.github/workflows/ci.yml`. See `docs/TESTING.md`. No component/UI tests today.

## What not to touch without a plan

- `src/components/MapView.tsx` — large, Leaflet-bound, no UI tests. Splitting it is planned but deferred; coordinate with the maintainer before attempting.
- `.github/workflows/scrape.yml` — production cron hitting live IAA site. Changes here can silently break the daily snapshot.
- `IAA_COOKIE_JAR` — session token; never log the full value, and never commit `.env.local`.

## House rules

- Strict TS, strict ESLint (`@typescript-eslint/no-explicit-any: error`). If you need `any`, you need a comment explaining why.
- Don't add deps without a specific reason — this app is deliberately small.
- No emojis in source or docs unless explicitly asked.
