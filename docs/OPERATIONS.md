# Operations

Configuration, runtime model, error handling, and operator procedures for notam-viz.

## Contents
- [Environment variables](#environment-variables)
- [Config files](#config-files)
- [Runtime model](#runtime-model)
- [Daily scrape workflow](#daily-scrape-workflow)
- [Error handling and logging](#error-handling-and-logging)
- [Rate limiting](#rate-limiting)
- [Usage stats and admin dashboard](#usage-stats-and-admin-dashboard)
- [CI](#ci)
- [Cookie-jar refresh procedure](#cookie-jar-refresh-procedure)
- [Deployment notes](#deployment-notes)

## Environment variables

| Variable | Required by | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Next.js app + scraper | Upstash Redis REST endpoint (e.g. `https://<store>.upstash.io`). The API route reads the latest snapshot from this store; the scraper writes to it. |
| `KV_REST_API_TOKEN` | Next.js app + scraper | Bearer token for the REST endpoint. Must be the **write** token: the app writes rate-limit buckets and the `stats:*` usage counters, and the scraper writes the snapshot. |
| `ADMIN_USERNAME` | Next.js app (production) | Login name for the hidden `/admin` dashboard. Set in Vercel as a *Sensitive* variable, Production only. Never committed: the repo is public. |
| `ADMIN_PASSWORD` | Next.js app (production) | Password for `/admin`. Same handling as above. |
| `ADMIN_SESSION_SECRET` | Next.js app (production) | At least 32 random characters (`openssl rand -hex 32`). Signs the admin session cookie. Rotating it logs out every session. |
| `STATS_RECORD` | Local only | `1` makes a local `next start` count launches. Without it, counting runs only when `VERCEL_ENV=production`, so previews and dev never touch the counters. |
| `IAA_COOKIE_JAR` | Scraper only | One-line `Cookie:` header from a logged-in Chrome session on `https://brin.iaa.gov.il/MobileAeroinfo/…`. Used as the default starting jar so the scraper can skip the Playwright mint on the fast path. When the WAF rejects these cookies, the scraper falls back to a fresh Playwright mint (see [docs/SCRAPING.md](SCRAPING.md) §Cookie-jar lifecycle). |

A Vercel KV integration auto-injects `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`. Only the first two are read by this codebase.

`.env*.local` is gitignored — do not commit cookie jars, KV tokens or admin credentials.

If any of the three `ADMIN_*` variables is missing (or the secret is shorter than 32 characters), every `/admin` path answers 404. There is no default value anywhere in code.

## Config files

| File | Purpose |
|---|---|
| [.env.local](../.env.local) | Local runtime env. Created by operator; not tracked. |
| [.env.local.example](../.env.local.example) | Template for `.env.local`. Tracked. |
| [next.config.mjs](../next.config.mjs) | Sets `reactStrictMode: true`; `serverComponentsExternalPackages: ['playwright']` so Next.js doesn't try to bundle Chromium. |
| [tsconfig.json](../tsconfig.json) | Path alias `@/* -> src/*`. Standard Next.js 14 setup. |
| [postcss.config.mjs](../postcss.config.mjs) | PostCSS. Loads `@tailwindcss/postcss` (Tailwind v4). There is no `tailwind.config.ts` — v4 auto-detects sources and the theme lives in [src/app/theme/](../src/app/theme/). |
| [.github/workflows/scrape.yml](../.github/workflows/scrape.yml) | Daily cron + manual dispatch for `scripts/scrape.ts`. |

No feature-flag system. No per-environment YAML. All behaviour is in code.

## Runtime model

- **Process shape.** One Next.js server (Vercel function or self-hosted). The API route is `runtime = 'nodejs'`. Reading `req.headers` for rate-limiting makes the route dynamic — ISR/revalidate don't apply — so all CDN caching is driven by the response `Cache-Control` header (1 h fresh + 24 h stale-while-revalidate).
- **Data store.** Vercel KV (Upstash Redis) holds `notams:latest` (a single JSON blob of `NotamApiResponse`), the short-lived `ratelimit:*` buckets, and one `stats:YYYY-MM-DD` counter hash per day (see [Usage stats](#usage-stats-and-admin-dashboard)).
- **Middleware.** [src/middleware.ts](../src/middleware.ts) runs on the Edge for `/api/notams` and `/admin/*` only. On Vercel it runs *before* the CDN cache, which is why launch counting lives there and not in the route handler.
- **Response caching.** `GET /api/notams` responds with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` — the CDN edge serves most user hits without ever reaching the function.
- **Scheduling.** Daily GitHub Action. The Vercel function never scrapes.
- **In-process state.** None for the app. The scraper has a module-scoped `cachedJar` + `jarMintLock` for re-use across retries inside a single run.
- **Startup dependencies.**
  - Vercel / Node ≥ 20 for the web app. No Chromium required at deploy time.
  - GitHub Actions `ubuntu-24.04` runner for the scraper (with `npx playwright install chromium` if `IAA_COOKIE_JAR` is missing). Pinned, not `ubuntu-latest` — see [Daily scrape workflow](#daily-scrape-workflow).
- **Shutdown.** Standard. The Playwright browser in the scraper always goes through `finally { browser.close() }`.

## Daily scrape workflow

[.github/workflows/scrape.yml](../.github/workflows/scrape.yml) runs `scripts/scrape.ts` on a daily cron. The script:

1. Calls `scrapeMobileNotams()` → `{ rawBlocks, fetchedAt, listed, failed }`.
2. Runs each raw block through `parseNotamBlock` ([src/lib/notam/parser.ts](../src/lib/notam/parser.ts)).
3. If zero NOTAMs parsed but the list had entries, **aborts without writing** — preserves the previous KV snapshot.
4. Calls `setLatestNotams(payload)` → `POST /set/notams:latest` on Upstash.
5. Logs `Scraped N/M NOTAMs in <iso>. Errors: K.` and exits 0.

**Runner image is pinned to `ubuntu-24.04`.** `npx playwright install --with-deps` only knows the Ubuntu releases that existed when that Playwright version shipped, and fails outright on a newer one (`Playwright does not support chromium on ubuntu26.04-x64`). When GitHub moved `ubuntu-latest` to 26.04 on 2026-10-22, the job failed at the install step every day until it was pinned (#62). Before moving the runner forward, upgrade `playwright` to a release that lists the target image — 1.61.0 is the first with 26.04. Tracked as #64.

**Triggering a scrape manually:**

```bash
gh workflow run "Daily NOTAM scrape"       # from GitHub CLI
# or from the Actions tab → Daily NOTAM scrape → Run workflow

# Locally (overwrites production KV — use with care):
npx tsx scripts/scrape.ts
```

## Error handling and logging

### Layers

1. **Individual detail fetch.** Non-WAF transient failure retries once after 800 ms; WAF failure either throws (env jar) or re-mints the jar once per run and retries. Anything still failing lands in `ScrapeResult.failed[]` and is embedded in the stored snapshot's `errors[]`.
2. **`scrapeMobileNotams` top level.** On `WafChallengeError` from the list fetch, the jar is refreshed once and the list fetch retried. Any other throw propagates up.
3. **Scraper script.** Refuses to overwrite KV when the parser yields zero records from a non-empty list.
4. **API route.** Wraps `getLatestNotams()` in `try/catch`. On success → 200; on empty KV → 503 with `errors: ['No cached NOTAMs in KV yet — run the scrape workflow']`; on throw → 500 with the error message.

### Logging

Structured JSON lines via [src/lib/server/log.ts](../src/lib/server/log.ts). One record per event; `stdout` for info, `stderr` for warn/error. Vercel and GitHub Actions both surface these inline in their respective log views — no log aggregator required for basic operations.

| Event | Fields | Where | Meaning |
|---|---|---|---|
| `scrape.jar.mint` | `jarSize`, `durationMs` | Scraper (GitHub Actions) | Playwright minted a fresh cookie jar. Normal on cold start; recurring means `IAA_COOKIE_JAR` is missing or rejected. |
| `scrape.waf_challenge` | `url`, `jarSource`, `stage` | Scraper | Upstream returned a Radware challenge. `jarSource=env` means `IAA_COOKIE_JAR` is stale and needs refresh. |
| `scrape.list.fetched` | `count`, `jarSource` | Scraper | List page parsed; `count` is the number of rows discovered. |
| `scrape.run` | `listed`, `succeeded`, `failed`, `wafFailures`, `durationMs` | Scraper | End-of-run summary. `wafFailures > 0` is the early warning for a cookie jar going bad. |
| `parser.no_notam_id` | `sample` (first 120 chars) | Parser | A raw block had no NOTAM ID pattern. Usually means the list/detail parse emitted garbage. |
| `api.notams.served` | `count`, `durationMs` | API route | Happy path. |
| `api.notams.empty_kv` | `durationMs` | API route | KV held no snapshot. 503 returned. |
| `api.notams.rate_limited` | `key`, `retryAfterSec` | API route | 429 returned. `key` is the client network block (IPv4 /24 or IPv6 /64), masked before emission to keep logs below a raw-IP retention profile. Rate-limit bucketing inside Upstash still uses the full IP. |
| `api.notams.error` | `message`, `durationMs` | API route | 500 returned. |
| `ratelimit.unavailable` | `message`, `limiter?` | API route / admin login | Upstash limiter threw. NOTAM requests are allowed (fail-open); with `limiter: 'admin'` the login attempt is refused (fail-closed). |
| `analytics.record.failed` | `message` | Middleware | Writing a launch counter failed. The request itself was unaffected. Logged at most once a minute per instance. |
| `admin.login.succeeded` | `key` | Admin login | Successful sign-in. `key` is the masked network block. Credentials are never logged. |
| `admin.login.failed` | `key` | Admin login | Wrong username or password. |
| `admin.login.rate_limited` | `key` | Admin login | More than 5 attempts in a minute from this client. |
| `admin.stats.read_failed` | `message` | `/admin` | Reading the counters failed; the dashboard shows an "unavailable" banner. |

## Rate limiting

`GET /api/notams` is rate-limited via `@upstash/ratelimit` with the existing Upstash Redis credentials. Sliding window **30 requests/minute per client IP**. The key is derived from (in order) `request.ip` (verified TCP peer from Vercel), `x-forwarded-for[0]`, `x-real-ip`, and finally the sentinel `anon`. On self-hosted deployments behind a non-trusting proxy, `x-forwarded-for` is client-controllable — strip it before the app receives the request if that's your posture. Exceeded requests return:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
Cache-Control: no-store

{"notams":[],"count":0,"errors":["Rate limit exceeded. Retry in 42s."],…}
```

**Fail-open semantics.** If the Upstash backend is unreachable, the limiter throws, [src/lib/server/rate-limit.ts](../src/lib/server/rate-limit.ts) catches, logs `ratelimit.unavailable`, and allows the request. Rationale: a temporarily-unreachable limiter is a worse outcome than a permissive one for a public NOTAM feed.

Tuning the limit: edit `LIMIT` and `WINDOW` constants at the top of `src/lib/server/rate-limit.ts`. No env knob — changing these is a deliberate code change that should go through review.

## Usage stats and admin dashboard

A hidden, password-protected page at `/admin` shows how the app is used: launches over a 7/30/90-day range with the change against the previous period, launches today, daily launches by platform, a weekday × hour heatmap (Israel time), the platform split, and the top 10 cities. Nothing links to it, it is `noindex`, and it is web-only: it is not part of the iOS or Android bundles.

**What is counted.** Every `GET /api/notams` is one launch: the apps and the website each fetch it once per start. [src/middleware.ts](../src/middleware.ts) classifies the request and increments counters after the response has been handed back (`waitUntil`), so it adds no latency and cannot fail the request.

| Platform | Rule |
|---|---|
| `bot` | Missing user agent, or one matching a crawler/tool pattern (`bot`, `curl`, `python`, …). |
| `ios` | `Origin: capacitor://localhost` (the iOS shell's scheme). |
| `android` | `Origin: https://localhost` (the Android shell's scheme). |
| `web` | Everything else. |

The apps are told apart by Origin only, never by user agent: in-app browsers (Instagram, Gmail) share the WebView user-agent traits and would otherwise be counted as the apps.

**Storage.** One Redis hash per Israel-local day, expiring after 400 days:

```
stats:2026-11-03
  h:14:ios     -> 12     launches in the 14:00 hour from the iOS app
  city:Haifa   -> 31     launches located in Haifa (bots excluded)
```

Three Redis commands per launch (two for bots). No IP address, user agent, identifier or per-launch record is stored; the city comes from Vercel's IP geolocation and the IP itself is never read. To wipe the history, delete the `stats:*` keys — the snapshot and rate limiter are unaffected.

**Access.** `/admin/login` takes the username and password from the `ADMIN_*` environment variables (see [Environment variables](#environment-variables)) and sets an 8-hour, HttpOnly, Secure, SameSite=Strict cookie scoped to `/admin`, signed with `ADMIN_SESSION_SECRET`. Login attempts are limited to 5 per minute per client and that limiter fails closed. To change the credentials, update the variables in Vercel and redeploy; to force every session out, also rotate `ADMIN_SESSION_SECRET`.

**Local check.** `.env.local` holds the production Upstash token, so do not run with `STATS_RECORD=1` against it — the test launches would land in the real counters. Point `KV_REST_API_URL` at a scratch store instead.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every pull request and every push to `main`:

```
npm ci
npm run lint        # next lint + custom rules (see .eslintrc.json)
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```

A green CI means: no ESLint errors, no TypeScript errors, and all Vitest tests pass. The scrape workflow (`scrape.yml`) is separate and continues to run on its daily cron.

Running the same gates locally:

```bash
npm run lint && npm run typecheck && npm run test
```

All three must pass before merging. The `test` gate also prevents regressions on the fixes from v0.4.0 (Q-code subject extraction, coord-parser Pattern 1c, WAF detection).

## Cookie-jar refresh procedure

Follow this when the scrape workflow fails with a `WafChallengeError` AND the fallback Playwright mint also failed (the env cookies are rejected and the headless-Chromium mint couldn't clear the challenge either). If only the env jar is stale, the scraper now auto-mints via Playwright and keeps running; a forced rotation is only needed when Playwright mints are being blocked from the runner's IP as well.

### 1. Open the IAA mobile site in your real Chrome

```
https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx
```

If you briefly see a page titled **Error 100**, wait ~5 s — `stormcaster.js` runs its challenge and redirects you to the real list.

### 2. Click into one detail page

Click any NOTAM row. The detail page should render with `Q) … A) … B) … C) … E) …` lines. That confirms your Chrome session is challenge-passed *for detail URLs* (the most restrictive path).

### 3. Copy the `Cookie:` header from DevTools

- Open DevTools, click **Network**, Cmd+R to refresh.
- Click the `maiDetails.aspx?rowID=…` row, scroll Request Headers, find `Cookie:`.
- Click the value → Cmd+A → Cmd+C. It's typically 500–2000 characters.

### 4. Check UA alignment

In the same Request Headers panel find `User-Agent:` — confirm it matches `USER_AGENT` in [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts). If Chrome has rolled forward, update `USER_AGENT` **and** the `sec-ch-ua` value in `BROWSER_HEADERS` before committing. Fingerprint mismatches can trigger re-challenge.

### 5. Paste into the right place

**For GitHub Actions:**

```bash
gh secret set IAA_COOKIE_JAR
# paste the one-line value, Enter, Ctrl+D
```

**For local use:**

```bash
cp .env.local.example .env.local      # first time only
# edit .env.local:
IAA_COOKIE_JAR=__uzma=…; __uzmb=…; TS…; ASP.NET_SessionId=…; uzmxj=…
```

No quotes, no line breaks inside the value.

### 6. Trigger a scrape and verify

```bash
gh workflow run "Daily Scrape"
# or:
npx tsx scripts/scrape.ts
```

Expect the logs to show `Scraped N/M NOTAMs …` with a reasonable `N` (100–120 typical) and `Errors: 0` or a handful.

### Failure hints

- **Still getting `WAF challenge with IAA_COOKIE_JAR`** — the cookies didn't carry. Re-copy the whole `Cookie:` value, confirm no line wraps.
- **`Radware WAF challenge` with `IAA_COOKIE_JAR` unset** — Playwright is running and failing. Paste cookies.
- **Zero NOTAMs parsed from a non-empty list** — the list-page DOM changed. Check the `tr[onclick^="rowClicked"]` / `td.DivRecordID` / `td.DivLocation` selectors in `parseList`. The scraper script refuses to overwrite KV in this case, so you'll see the error without losing data.

## Deployment notes

- **Vercel:** works on the default Node runtime. Attach a Vercel KV / Upstash Redis integration to the project — it auto-provisions `KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc. The Vercel function never invokes Playwright, so Chromium download size is a non-issue for the web app. `serverComponentsExternalPackages: ['playwright']` keeps the bundler from trying to include it.
- **GitHub Actions runner:** the scraper lives here. Install Chromium inside the workflow (`npx playwright install chromium`) only if you expect the jar-mint fallback to run. With `IAA_COOKIE_JAR` set, Playwright is not launched at runtime but `playwright` is still imported — `playwright` needs to remain in `dependencies`.
- **Self-hosted:** any Node ≥ 20 host works. Provide `KV_REST_API_URL` and `KV_REST_API_TOKEN` and you're done.
- **Horizontal scaling.** Safe — KV is the only state. The CDN caches most hits.
- **TLS:** handled by Vercel / your host.
