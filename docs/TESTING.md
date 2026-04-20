# Testing

Vitest runs the test suite. Config: [vitest.config.ts](../vitest.config.ts). Tests live next to the code they exercise (`src/lib/foo.ts` → `src/lib/foo.test.ts`); fixtures live in [tests/fixtures/](../tests/fixtures/).

## Running

```
npm run test              # run once, exit code mirrors CI
npm run test:watch        # rerun on change
npm run test:coverage     # v8 coverage report (text + lcov)
npm run test -- foo       # filter to tests whose name matches /foo/
npm run test src/lib/qcode-subjects.test.ts   # run a single file
```

## Conventions

- **Library tests only for now.** No jsdom, no React Testing Library. Anything that imports `'use client'` components stays out until a browser harness is set up.
- **Fixtures over mocks.** Real HTML or ICAO blocks from a past scrape live in [tests/fixtures/](../tests/fixtures/); unit tests read them directly. This catches real-world edge cases that hand-written strings miss.
- **Pin the bugs you fix.** Every correctness fix in v0.4.0 (Q-code substring, coord-parser pattern 1c gate, WAF detection) has at least one failing-before / passing-after test. Keep that invariant.
- **Dedup keys in extractors.** The coord-parser dedups by rounded `lat.toFixed(6),lon.toFixed(6)`. If you add a new pattern that could overlap with existing ones, test the collision case.
- **No timers, no network.** Tests must run under `node` with no external reachability. If you find yourself reaching for `vi.useFakeTimers`, back up — there's usually a pure-function refactor hiding in the problem.

## Adding a test

1. Create `src/lib/foo.test.ts` next to `foo.ts`.
2. Import only from relative paths or from `@/…` (Vitest resolves the same `@` alias as TypeScript).
3. Structure with `describe` per function, `it` per case. One assertion per behavior; split if you're tempted to `and`.
4. If a new fixture is needed, add it under [tests/fixtures/](../tests/fixtures/) with a name that says what it is (`list-ok.html`, `notam-perm.txt`). Don't reuse one fixture across two unrelated behaviors.

## What's not covered

- UI components — MapView, NotamList, filter bar. Defer until a Leaflet-aware component harness is set up.
- End-to-end browser tests — deferred for the same reason.
- Live scraper — exercising the real IAA site is a GitHub Actions concern; the local test uses fixtures + the pure validators.

See [ROADMAP.md](ROADMAP.md) for the full coverage matrix.
