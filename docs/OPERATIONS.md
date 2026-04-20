# Operations

Configuration, runtime model, error handling, and operator procedures for notam-viz.

## Contents
- [Environment variables](#environment-variables)
- [Config files](#config-files)
- [Runtime model](#runtime-model)
- [Error handling and logging](#error-handling-and-logging)
- [Cookie-jar refresh procedure](#cookie-jar-refresh-procedure)
- [Deployment notes](#deployment-notes)

## Environment variables

| Variable | Required? | Consumed in | Purpose |
|---|---|---|---|
| `IAA_COOKIE_JAR` | Effectively yes for a reliable deployment | [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) `envJar()` | Raw `Cookie:` header string from a logged-in Chrome session. When set, `getJar()` returns this jar unconditionally — no Playwright mint, no TTL cache. When the WAF rejects these cookies, the scraper throws a clear "likely expired" error instead of silently re-minting. |

That's the only one the app reads. Next.js also exposes `NODE_ENV`, `PORT`, and so on, but nothing in this repo checks them beyond the framework defaults.

No secrets handling infrastructure is present — no vault, no SOPS, no KMS integration. `.env.local` is the expected storage location and is covered by `.gitignore` (`.env*.local` — see the repo's `.gitignore`). Do not commit the real cookie string.

## Config files

| File | Purpose |
|---|---|
| [.env.local](../.env.local) | Local/prod runtime env. Created by operator; not tracked. |
| [.env.local.example](../.env.local.example) | Template for `.env.local` with instructions. Tracked. |
| [next.config.mjs](../next.config.mjs) | Sets `reactStrictMode: true` and adds a blanket `Cache-Control: public, max-age=300` header on `/api/:path*` at the framework level (belt-and-braces with the per-response header in the route handler). |
| [tsconfig.json](../tsconfig.json) | TypeScript config. Path alias `@/* -> src/*`. Standard Next.js 14 setup. |
| [tailwind.config.ts](../tailwind.config.ts) / [postcss.config.mjs](../postcss.config.mjs) | Tailwind + PostCSS. Applies to all files under `src/`. |

No feature-flag system. No per-environment YAML/JSON. All behaviour toggles are in code.

## Runtime model

- **Process shape.** One Next.js server. The API route is declared `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, so it runs on Node (needed for Playwright) and is never statically generated.
- **Threading.** Single-threaded Node event loop. Scraping is async I/O with concurrency 4 inside the event loop. No worker threads.
- **Scheduling.** None. There is no cron, no background job runner, no queue. Each `GET /api/notams` triggers a live upstream scrape unless the Next.js response cache is warm (`Cache-Control: public, max-age=300`).
- **In-process state.**
  - `cachedJar` / `jarMintLock` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) (module-scoped).
  - Nothing else. No Redis, no memcached, no DB.
- **Startup dependencies.**
  - Node ≥ 20 (matches `@types/node` ^20 and Next.js 14 requirements).
  - `playwright` + a Chromium install (`npx playwright install chromium`) only if you expect `mintJarWithBrowser()` to run — i.e. `IAA_COOKIE_JAR` is unset. If the env var is set, Playwright is never invoked at runtime (it's still resolved as a module import, so the package still needs to be installed).
  - Network egress to `brin.iaa.gov.il` and OpenStreetMap tile servers.
- **Shutdown.** Standard Next.js shutdown. The Playwright browser in `mintJarWithBrowser()` always goes through a `finally { browser.close() }`, even on throw.

## Error handling and logging

### Layers

1. **Individual detail fetch.** A non-WAF failure retries once after 800 ms; a WAF failure either throws (env jar) or re-mints the jar once per scrape and retries. Anything still failing lands in `ScrapeResult.failed[]`.
2. **`scrapeMobileNotams` top level.** On `WafChallengeError` from the list fetch, the jar is refreshed once and the list fetch retried. Any other throw propagates up.
3. **Route handler.** Wraps everything in `try/catch`. A caught exception returns HTTP 500 with `errors: [message]`. A successful scrape with partial failures returns HTTP 200 with `errors: [per-rowID messages]` and a reduced `count`.

### Logging

Not configured. The scraper itself does not `console.log` — output is entirely through return values and thrown errors. Next.js logs the HTTP request line and any uncaught exceptions from route handlers.

If you need structured logging, the right place to inject it is at three points:
- Inside `mintJarWithBrowser` at the entry/exit of the Playwright flow.
- Inside `fetchList` / `fetchDetailOnce` around `fetchWithCookies`.
- Inside the `GET` handler wrapping `scrapeMobileNotams` to emit timing + error counts.

## Cookie-jar refresh procedure

Follow this when the API starts returning errors containing `WAF challenge with IAA_COOKIE_JAR — cookies likely expired`.

### 1. Open the IAA mobile site in your real Chrome

Navigate to:

```
https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx
```

If you briefly see a page titled **Error 100**, wait ~5 s — `stormcaster.js` will complete its challenge and redirect you to the real list.

### 2. Click into one detail page

Click any NOTAM row. The detail page should render with `Q) ...`, `A) ... B) ... C) ...`, `E) ...`, `F) ... G) ...` lines. That confirms your Chrome session is challenge-passed *for detail URLs* (the most restrictive path).

### 3. Copy the `Cookie:` header from DevTools

- Open DevTools (Cmd+Option+I on Mac, F12 on Win/Linux).
- Click **Network**.
- Cmd+R to refresh the detail page.
- In the left pane, click the top row — it's named `maiDetails.aspx?rowID=…`.
- Scroll **Request Headers** in the right pane. Find the line labeled `Cookie:`.
- Click the value, Cmd+A (Ctrl+A), Cmd+C (Ctrl+C). It's typically 500–2000 characters.

### 4. Match your scraper UA to Chrome's UA

In the same Request Headers panel find `User-Agent:` — confirm it matches `USER_AGENT` in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts). If Chrome has rolled forward (e.g. from 147 to 148), update `USER_AGENT` *and* the `sec-ch-ua` value in `BROWSER_HEADERS` before restarting — fingerprint mismatch between UA and cookies can trigger re-challenge.

### 5. Paste into `.env.local`

```bash
# Project root
cp .env.local.example .env.local    # first time only
```

Edit `.env.local`:

```
IAA_COOKIE_JAR=__uzma=…; __uzmb=…; TS01e4f122=…; ASP.NET_SessionId=…; uzmxj=…
```

No quotes, no line breaks inside the value. One logical line.

### 6. Restart the server and verify

```bash
npm run dev       # or: pm2 restart notam-viz, systemctl restart …, docker compose restart
curl -s http://localhost:3000/api/notams | jq '{count, errorCount: (.errors|length // 0)}'
```

Expect `count` around 100–120 and `errorCount` 0 or a handful.

### Failure hints

- **Still getting `WAF challenge with IAA_COOKIE_JAR`** — the cookies didn't carry. Double-check you copied the whole `Cookie:` value (it's long) and that there are no line wraps. Compare the UA in Chrome with `USER_AGENT` in the scraper.
- **`Radware WAF challenge returned for https://.../maiDetails.aspx`** with `IAA_COOKIE_JAR` *not* set — Playwright is running the mint path and failing. Expected on any IP Radware has previously flagged. Paste cookies instead.
- **`count` 0 + `List page parsed zero NOTAMs`** — the list-page DOM changed. Compare the current HTML against the `tr[onclick^="rowClicked"]` / `td.DivRecordID` / `td.DivLocation` selectors in [src/lib/scraper-mobile.ts](../src/lib/scraper-mobile.ts) `parseList`.

## Deployment notes

- **Vercel:** works on the default Node runtime. Playwright download size (~100–150 MB Chromium) exceeds the free-tier function limit, so either set `IAA_COOKIE_JAR` (Playwright is never invoked) or deploy to a host with no function size limit. The module is still imported so it must still install.
- **Docker / VPS:** install Chromium's system dependencies before `npx playwright install chromium` (see Playwright's official docs for your distro). Persist `.env.local` or an equivalent env-var file.
- **Long-running host recommended.** The 15-minute `cachedJar` and the `Cache-Control: max-age=300` response cache only help if the process persists across requests.
- **Horizontal scaling.** Safe (statelessness is only broken by the module-scoped cookie cache, and each instance would mint/refresh its own). Do not share a cookie jar between instances via an external store — cookie rotation is tied to the TLS/IP fingerprint that minted it.

No TLS/certificate/CDN concerns beyond whatever the host provides — the app itself serves only HTTP over Next.js; it doesn't terminate TLS.
