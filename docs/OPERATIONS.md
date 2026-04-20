# Operations

Configuration, runtime model, error handling, and operator procedures for notam-viz.

## Contents
- [Environment variables](#environment-variables)
- [Config files](#config-files)
- [Runtime model](#runtime-model)
- [Daily scrape workflow](#daily-scrape-workflow)
- [Error handling and logging](#error-handling-and-logging)
- [Cookie-jar refresh procedure](#cookie-jar-refresh-procedure)
- [Deployment notes](#deployment-notes)

## Environment variables

| Variable | Required by | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Next.js app + scraper | Upstash Redis REST endpoint (e.g. `https://<store>.upstash.io`). The API route reads the latest snapshot from this store; the scraper writes to it. |
| `KV_REST_API_TOKEN` | Next.js app + scraper | Bearer token for the REST endpoint. For the running web app a read-only token is sufficient (`KV_REST_API_READ_ONLY_TOKEN`); the scraper needs write. |
| `IAA_COOKIE_JAR` | Scraper only | One-line `Cookie:` header from a logged-in Chrome session on `https://brin.iaa.gov.il/MobileAeroinfo/…`. Lets the scraper skip the Playwright mint path. When the WAF rejects these cookies, the scraper throws a clear "cookies likely expired" error. |

A Vercel KV integration auto-injects `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL`. Only the first two are read by this codebase.

`.env*.local` is gitignored — do not commit cookie jars or KV tokens.

## Config files

| File | Purpose |
|---|---|
| [.env.local](../.env.local) | Local runtime env. Created by operator; not tracked. |
| [.env.local.example](../.env.local.example) | Template for `.env.local`. Tracked. |
| [next.config.mjs](../next.config.mjs) | Sets `reactStrictMode: true`; `serverComponentsExternalPackages: ['playwright']` so Next.js doesn't try to bundle Chromium. |
| [tsconfig.json](../tsconfig.json) | Path alias `@/* -> src/*`. Standard Next.js 14 setup. |
| [tailwind.config.ts](../tailwind.config.ts) / [postcss.config.mjs](../postcss.config.mjs) | Tailwind + PostCSS. |
| [.github/workflows/scrape.yml](../.github/workflows/scrape.yml) | Daily cron + manual dispatch for `scripts/scrape.ts`. |

No feature-flag system. No per-environment YAML. All behaviour is in code.

## Runtime model

- **Process shape.** One Next.js server (Vercel function or self-hosted). The API route is `runtime = 'nodejs'` with `revalidate = 3600`, so it reuses the function instance and hits KV at most once per hour per region.
- **Data store.** Vercel KV (Upstash Redis) holds exactly one key: `notams:latest`, a single JSON blob of `NotamApiResponse`.
- **Response caching.** `GET /api/notams` responds with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` — the CDN edge serves most user hits without ever reaching the function.
- **Scheduling.** Daily GitHub Action. The Vercel function never scrapes.
- **In-process state.** None for the app. The scraper has a module-scoped `cachedJar` + `jarMintLock` for re-use across retries inside a single run.
- **Startup dependencies.**
  - Vercel / Node ≥ 20 for the web app. No Chromium required at deploy time.
  - GitHub Actions Ubuntu runner for the scraper (with `npx playwright install chromium` if `IAA_COOKIE_JAR` is missing).
- **Shutdown.** Standard. The Playwright browser in the scraper always goes through `finally { browser.close() }`.

## Daily scrape workflow

[.github/workflows/scrape.yml](../.github/workflows/scrape.yml) runs `scripts/scrape.ts` on a daily cron. The script:

1. Calls `scrapeMobileNotams()` → `{ rawBlocks, fetchedAt, listed, failed }`.
2. Runs each raw block through `parseNotamBlock` ([src/lib/notam-parser.ts](../src/lib/notam-parser.ts)).
3. If zero NOTAMs parsed but the list had entries, **aborts without writing** — preserves the previous KV snapshot.
4. Calls `setLatestNotams(payload)` → `POST /set/notams:latest` on Upstash.
5. Logs `Scraped N/M NOTAMs in <iso>. Errors: K.` and exits 0.

**Triggering a scrape manually:**

```bash
gh workflow run "Daily Scrape"             # from GitHub CLI
# or from the Actions tab → Daily Scrape → Run workflow

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

Not configured. Neither the scraper nor the API route emits structured logs — only return values and thrown errors. GitHub Actions logs capture the scraper's `console.log`/`console.error` output. Vercel function logs capture any thrown exceptions from the API route.

## Cookie-jar refresh procedure

Follow this when the scrape workflow fails with `WAF challenge with IAA_COOKIE_JAR — cookies likely expired`.

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

In the same Request Headers panel find `User-Agent:` — confirm it matches `USER_AGENT` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts). If Chrome has rolled forward, update `USER_AGENT` **and** the `sec-ch-ua` value in `BROWSER_HEADERS` before committing. Fingerprint mismatches can trigger re-challenge.

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
