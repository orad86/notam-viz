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

## Design system

The visual language is the shared house theme from `orad86/skytutor-agent` ("sectional chart / daylight editorial" — warm paper, navy ink, aviation orange). Tailwind v4.

- `src/app/theme/tokens.css` and `tailwind-bridge.css` are **copied verbatim** from that repo. Do not edit them locally; changes belong upstream. Property names are deliberately outside Tailwind's own namespaces (`--fs-*`, `--corner-*`, `--elev-*`) — renaming one makes the bridge self-referential and it silently resolves to nothing.
- `src/app/theme/notam-viz.css` is the only file permitted to diverge, and only for `--accent*` and `--type-*`.
- **No raw hex in components.** Use the token utilities (`bg-paper-raised`, `text-ink-2`, `border-rule`, `bg-accent-wash`). Map geometry colour lives in `globals.css` on `.notam-pane path`, not in `pathOptions`.
- Light theme only, by design. There is no dark mode and no `dark:` variant anywhere.
- Icons are `lucide-react`, always sized `size-3.5`/`size-4` and `aria-hidden`. No emoji glyphs in JSX.
- Import order in `globals.css` is load-bearing: the `@layer` declaration first, then `tailwindcss`, then Leaflet into `layer(vendor)`, then tokens → bridge → app layer. Leaflet **must** be layered — unlayered CSS beats every Tailwind utility in v4.

## Map architecture

`src/components/map/` (was one 844-line `MapView.tsx`).

- **Every NOTAM path is `interactive: false`.** Leaflet delivers a click to exactly one shape — it walks the DOM ancestor chain, and overlapping siblings are never ancestors — so per-shape handlers cannot resolve a stack. All clicks land on the map and `hit-test.ts` answers them via Leaflet's own `_containsPoint`. Do not re-add per-shape click handlers.
- **Do not put focus or selection state in `pathOptions`.** react-leaflet compares those by reference, so an object literal built during render calls `setStyle()` on all ~114 shapes every render. Visual state is classList on the `notams` pane (`.is-dimmed`, `.is-focused`, `.is-selected`).
- There are **no Leaflet popups**. Their `_openPopup` used to call `stop(e)`, which suppressed the map click — removing them without the above architecture makes every shape click select and instantly clear.
- Detail lives in `src/components/detail/` (bottom sheet on mobile, docked panel at `md`), portaled to `document.body` so Leaflet's gesture handlers never see it.

## Testing harness

Vitest. `npm run test` locally; CI workflow is `.github/workflows/ci.yml`. See `docs/TESTING.md`. No component/UI tests today — the map's logic is instead extracted into pure modules (`hit-test.ts`, `decode.ts`) that are covered.

## What not to touch without a plan

- `.github/workflows/scrape.yml` — production cron hitting live IAA site. Changes here can silently break the daily snapshot.
- `IAA_COOKIE_JAR` — session token; never log the full value, and never commit `.env.local`.
- `src/lib/notam/airports.ts` — the coordinates and names are known to be wrong (`LLIB` is labelled Eilat but sits in Jerusalem; `LLER` conflicts with the KML). It is the last-resort geometry fallback, so NOTAMs pin there. Fixing it needs a verified aerodrome source; tracked separately. The decoder deliberately shows the ICAO code from the NOTAM rather than a name from this table.

## House rules

- Strict TS, strict ESLint (`@typescript-eslint/no-explicit-any: error`). If you need `any`, you need a comment explaining why. Leaflet internals are reached through narrowing type guards, not casts.
- Don't add deps without a specific reason — this app is deliberately small. Current UI deps: `lucide-react`, `clsx`, `tailwind-merge`.
- No emojis in source or docs unless explicitly asked.
