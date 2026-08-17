# Testing

Vitest runs the test suite. Config: [vitest.config.ts](../vitest.config.ts). Tests live under [tests/](../tests/), mirroring `src/lib/`. One `*.test.ts` per source module. Fixtures under [tests/fixtures/](../tests/fixtures/).

## Running

```
npm run test                              # run once, exit code mirrors CI
npm run test:watch                        # rerun on change
npm run test:coverage                     # v8 coverage report (text + lcov)
npm run test -- foo                       # filter to tests whose name matches /foo/
npm run test tests/notam/qcodes.test.ts   # run a single file
```

## Conventions

- **Library tests only for now.** No jsdom, no React Testing Library. Anything that imports `'use client'` components stays out until a browser harness is set up.
- **Fixtures over mocks.** Real HTML or ICAO blocks from a past scrape live in [tests/fixtures/](../tests/fixtures/); unit tests read them directly. This catches real-world edge cases that hand-written strings miss.
- **Pin the bugs you fix.** Every correctness fix has a failing-before / passing-after test (e.g. the Q-code substring(0,2) regression in [tests/notam/qcodes.test.ts](../tests/notam/qcodes.test.ts), the `formatUtcDate` Invalid-Date fix in [tests/notam/format.test.ts](../tests/notam/format.test.ts)). Keep the invariant.
- **Dedup keys in extractors.** The coord-parser dedups by rounded `lat.toFixed(6),lon.toFixed(6)`. If you add a new pattern that could overlap with existing ones, test the collision case.
- **No timers, no network.** Tests must run under `node` with no external reachability. If you find yourself reaching for `vi.useFakeTimers`, back up — there's usually a pure-function refactor hiding in the problem.

## Adding a test

1. Create `tests/notam/foo.test.ts` (or `tests/server/foo.test.ts`) mirroring the source path of `src/lib/notam/foo.ts`.
2. Import the function under test using the `@/` alias: `import { foo } from '@/lib/notam/foo';`. Don't use long relative paths.
3. Structure with `describe` per function, `it` per case. One assertion per behavior; split if you're tempted to `and`.
4. If a new fixture is needed, add it under [tests/fixtures/](../tests/fixtures/) with a name that says what it is (`list-ok.html`, `notam-perm.txt`). Don't reuse one fixture across two unrelated behaviors.

## Coverage matrix

Source files under `src/lib/**/*.ts` and whether they have a Vitest unit test. "indirect" = exercised by another module's tests but not pinned directly.

| Module | Tested | Notes |
| --- | --- | --- |
| `src/lib/notam/parser.ts` | yes | [tests/notam/parser.test.ts](../tests/notam/parser.test.ts) — fixture-backed; minimal NOTAM, permanent, multi-line, mobile layout. |
| `src/lib/notam/coord-parser.ts` | yes | [tests/notam/coord-parser.test.ts](../tests/notam/coord-parser.test.ts) — DMS/DM patterns + dedup. |
| `src/lib/notam/qcodes.ts` | yes | [tests/notam/qcodes.test.ts](../tests/notam/qcodes.test.ts) — pins the substring(0,2) bug; `decodeQCode` descriptions, incl. `AR` (ATS route) and the deliberate absence of `AR` from the category table. |
| `src/lib/notam/altitude.ts` | yes | [tests/notam/altitude.test.ts](../tests/notam/altitude.test.ts) — user input + Q-line 3-digit codes + band combinator. |
| `src/lib/notam/format.ts` | yes | [tests/notam/format.test.ts](../tests/notam/format.test.ts) — date, eItem (incl. unmatched trailing paren), altitude range, scope, traffic, category color. |
| `src/lib/notam/geometry.ts` | yes | [tests/notam/geometry.test.ts](../tests/notam/geometry.test.ts) — bbox area for polygon NOTAMs. |
| `src/lib/notam/decode.ts` | yes | [tests/notam/decode.test.ts](../tests/notam/decode.test.ts) — headline from Q-code, category fallback, XX plain-language, PERM, schedule vocabulary + clause punctuation, abbreviation tokenising. Every body assertion round-trips the tokens back to the source string: expansions are additive, so losing a character is a correctness bug. |
| `src/components/map/hit-test.ts` | yes | [tests/map/hit-test.test.ts](../tests/map/hit-test.test.ts) — nested shapes return all hits topmost-first, multi-layer NOTAMs counted once, unmounted ids skipped, non-path layers ignored. Stubs `map.mouseEventToLayerPoint` and `_containsPoint`, so it needs no jsdom. |
| `src/lib/notam/route-filter.ts` | yes | [tests/notam/route-filter.test.ts](../tests/notam/route-filter.test.ts) — corridor + altitude band matching. |
| `src/lib/notam/airports.ts` | no | Static lookup table; covered indirectly by `parser.ts` tests. |
| `src/lib/server/scraper-mobile.ts` | yes (validators only) | [tests/server/scraper-mobile.test.ts](../tests/server/scraper-mobile.test.ts) — pure WAF validators against captured HTML. The live scrape is exercised in CI by `scripts/scrape.ts`, not from Vitest. |
| `src/lib/server/{config,kv,log,rate-limit}.ts` | no | Thin wrappers / constants. |
| `src/lib/export/{pdf,kml,gpx,download}.ts` | no | Format builders; covered by manual smoke during PR review. |
| `src/lib/kml-layer.ts` | no | Browser fetch — needs jsdom + network mock. |
| `src/lib/aviation-icons.ts` | no | Inline SVG strings + `divIcon` factory; trivial. |
| `src/lib/render-markdown.tsx` | no | Component — defer until a UI harness exists. |
| `src/lib/version.ts` | no | Re-export of `package.json#version`. |
| `src/components/**` | no | No UI test harness yet. The map's decidable logic is deliberately extracted into `map/hit-test.ts` so it can be covered without one; verification of the rendered map is Playwright-by-hand during PR review. |
| `src/hooks/**` | no | Hooks rely on the React runtime. |
| `src/app/api/notams/route.ts` | no | Needs KV / rate-limit mocks. |

## What's not covered

- UI components — MapView, NotamList, filter bar. Defer until a Leaflet-aware component harness is set up.
- End-to-end browser tests — deferred for the same reason.
- Live scraper — exercising the real IAA site is a GitHub Actions concern; the local test uses fixtures + the pure validators.
