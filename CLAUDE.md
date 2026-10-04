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
- Light theme only, by design. There is no dark mode and no `dark:` variant anywhere. The Android shell theme is pinned to the light AppCompat parent for the same reason — Capacitor scaffolds a `DayNight` parent that would paint a dark window behind the light UI.
- **Anything anchored below the app header offsets by `--app-header-h`, never by `3rem`.** The header is `safe-top` + a 3rem row, and `viewportFit: 'cover'` makes `env(safe-area-inset-top)` non-zero on every iOS device — so a literal `top-12` puts an inset-sized band of that surface underneath the header. That shipped in v0.7.0 and hid the detail panel's close button, clipped the layer panel, and pushed the sidebar footer off the bottom of an iPhone. The token lives in `globals.css`. On Android the inset resolves to 0 with an opaque status bar, so the token collapses to 3rem there — which is correct, not a reason to hardcode it.
- **No `target="_blank"` on an internal route.** Capacitor hands every `window.open` to the OS. On iOS that is `UIApplication.shared.open`, which has no handler for the `capacitor://` scheme the shell serves from, so the link is a silent no-op; on Android it leaves the app for the external browser, which then cannot resolve the route either. Use `next/link`.
- Icons are `lucide-react`, always sized `size-3.5`/`size-4` and `aria-hidden`. No emoji glyphs in JSX.
- Import order in `globals.css` is load-bearing: the `@layer` declaration first, then `tailwindcss`, then Leaflet into `layer(vendor)`, then tokens → bridge → app layer. Leaflet **must** be layered — unlayered CSS beats every Tailwind utility in v4.

## Map architecture

`src/components/map/` (was one 844-line `MapView.tsx`).

- **Every NOTAM path is `interactive: false`.** Leaflet delivers a click to exactly one shape — it walks the DOM ancestor chain, and overlapping siblings are never ancestors — so per-shape handlers cannot resolve a stack. All clicks land on the map and `hit-test.ts` answers them via Leaflet's own `_containsPoint`. Do not re-add per-shape click handlers.
- **`pane`, `interactive` and `className` must be TOP-LEVEL props on the react-leaflet component**, never inside `pathOptions`. They are creation-time options; `setStyle()` cannot change them, and `pathOptions` is all react-leaflet passes to `setStyle`. Use the `SHAPE_PROPS` constant. Getting this wrong silently puts every shape in the default overlay pane — that shipped in v0.7.0.
- **Verify map changes against `next build && next start`, not `next dev`.** StrictMode double-invokes effects in dev, which masks Leaflet pane and layer-ordering bugs entirely.
- **Do not put focus or selection state in `pathOptions`.** react-leaflet compares those by reference, so an object literal built during render calls `setStyle()` on all ~114 shapes every render. Visual state is classList on the `notams` pane (`.is-dimmed`, `.is-focused`, `.is-selected`).
- There are **no Leaflet popups**. Their `_openPopup` used to call `stop(e)`, which suppressed the map click — removing them without the above architecture makes every shape click select and instantly clear.
- **A stack outlives the click that opened it.** Picking a row folds `StackPicker` to a reopenable chip rather than clearing `stack`, because committing also flies the map to the chosen NOTAM — so re-tapping the same pixel does not find the others. It is the *next* map click that retires the stack, which is why `MapClickHandler` calls `onStack` on every ordinary click including the empty one, and why the picker is keyed on a per-click `seq`: an overlap spans many pixels, so keying on the NOTAM ids leaves the chip up when a later click resolves to the same set.
- **Layout that differs by breakpoint uses `md:` variants, not `isDesktop &&`.** They mean the same width, but the JS flag is `false` during SSR, so gating a class on it drops the class from the server HTML and the map visibly jumps once React hydrates. `useIsDesktop` is for values CSS cannot express — the `flyToBounds` padding numbers — not for picking classes.
- **Popovers in the sidebar anchor to the filter row, not to their trigger.** A 240px popover `end-0`-anchored to a 54px button hangs off the left edge of a 320px sidebar. The row owns `relative`; the trigger wrapper deliberately does not.
- Detail lives in `src/components/detail/` (bottom sheet on mobile, docked panel at `md`), portaled to `document.body` so Leaflet's gesture handlers never see it.

## Native shells

`ios/` and `android/` are both committed and both wrap the same static export from `scripts/native-build.mjs`. See `docs/IOS.md` and `docs/ANDROID.md`.

- **Never commit signing material.** `android/key.properties`, any `.jks` or `.keystore`, and `.env.local` are gitignored. Check `git status` before committing anything under `android/`.
- **`ios-templates/` and `android-templates/` are the source of truth** for every hand-edit layered on top of `npx cap add <platform>`. If you change a native config file, change the template too, or the next person who re-scaffolds loses it.
- **The Capacitor major version is pinned by Google Play, not by preference.** Capacitor Android does not support a target SDK other than its own, and Play requires the current one. Raising `targetSdkVersion` means a Capacitor major bump, which drags the Node version with it.
- **Adding a web API that needs a permission is an Android manifest change.** iOS infers nothing from `Info.plist` alone, but Android refuses an undeclared runtime permission *silently* — no dialog, straight to denied. Geolocation already hit this.
- **Check `git status` for `src/app/_api_native_disabled` before every commit.** `native-build.mjs` moves `src/app/api` aside during the build and restores it afterwards. Older copies of the script stranded the rename when a step failed, and `git add -A` then committed it, which took production `/api/notams` down (v0.7.5). The script now self-heals and `tests/build/api-route.test.ts` guards it, but stage files by name rather than `-A` anyway.
- Gradle needs a JDK in the 17-21 range. Android Studio's bundled runtime is newer and Gradle rejects it.

## Testing harness

Vitest. `npm run test` locally; CI workflow is `.github/workflows/ci.yml`. See `docs/TESTING.md`. No component/UI tests today — the map's logic is instead extracted into pure modules (`hit-test.ts`, `decode.ts`) that are covered. There is no Android or iOS build in CI; both are built manually.

## What not to touch without a plan

- `.github/workflows/scrape.yml` — production cron hitting live IAA site. Changes here can silently break the daily snapshot.
- `IAA_COOKIE_JAR` — session token; never log the full value, and never commit `.env.local`.
- `src/lib/notam/airports.ts` — the coordinates and names are known to be wrong (`LLIB` is labelled Eilat but sits in Jerusalem; `LLER` conflicts with the KML). It is the last-resort geometry fallback, so NOTAMs pin there. Fixing it needs a verified aerodrome source; tracked separately. The decoder deliberately shows the ICAO code from the NOTAM rather than a name from this table.

## House rules

- Strict TS, strict ESLint (`@typescript-eslint/no-explicit-any: error`). If you need `any`, you need a comment explaining why. Leaflet internals are reached through narrowing type guards, not casts.
- Don't add deps without a specific reason — this app is deliberately small. Current UI deps: `lucide-react`, `clsx`, `tailwind-merge`.
- No emojis in source or docs unless explicitly asked.
