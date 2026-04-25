# Scraping

Deep dive on how notam-viz gets data past the IAA's Radware CloudWAF + Bot Manager. This is the most operationally load-bearing part of the app; understand it before changing anything in [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts).

## Contents
- [Why the mobile endpoint](#why-the-mobile-endpoint)
- [Endpoints in use](#endpoints-in-use)
- [Cookie-jar lifecycle](#cookie-jar-lifecycle)
- [Request protocol](#request-protocol)
- [Concurrency and pacing](#concurrency-and-pacing)
- [Retry strategy](#retry-strategy)
- [Failure modes](#failure-modes)
- [Tuning constants](#tuning-constants)

## Why the mobile endpoint

The IAA publishes NOTAMs on two surfaces:

| Surface | URL | Transport |
|---|---|---|
| Desktop | `https://brin.iaa.gov.il/aeroinfo/AeroInfo.aspx?msgType=Notam` | ASP.NET WebForms with `__VIEWSTATE`/`__EVENTVALIDATION`, `UpdatePanel` partial postbacks triggered by clicking a per-row `btnMoreInfo`. Each NOTAM's full body is rendered on demand by the `UpdatePanel`. |
| Mobile | `https://brin.iaa.gov.il/MobileAeroinfo/…` | Plain static HTML. One page for the list, one page per NOTAM for the detail. |

Both go through the same Radware Bot Manager (script `stormcaster.js` from `18f5227b-e27b-445a-a53f-f845fbe69b40/stormcaster.js`, bot-manager ID `c99a4269-161c-4242-a3f0-28d44fa6ce24`). The desktop path is effectively unscrapable because:

- Direct postbacks to `btnMoreInfo` with a correct form body return a `<title>Error 100</title>` challenge page, not the `UpdatePanel` delta.
- The legacy `AeroInfo.asmx?op=getMoreMsgInfo` SOAP endpoint is blocked at the WAF layer.
- Driving Puppeteer through the desktop page clicks at least 114 expand buttons per fetch, takes tens of seconds, and silently drops NOTAMs when individual `UpdatePanel` responses time out.

The mobile surface exposes the same backend as static HTML, so: one list fetch + N detail fetches, all `GET`, no form state. The WAF is still present but is satisfied by a valid cookie jar.

## Endpoints in use

Defined at the top of [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts):

| Constant | URL |
|---|---|
| `WELCOME_URL` | `https://brin.iaa.gov.il/MobileAeroinfo/maiwelcome.aspx` |
| `LIST_URL` | `https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx` |
| `DETAIL_URL(rowID)` | `https://brin.iaa.gov.il/MobileAeroinfo/maiDetails.aspx?rowID={rowID}&scrpos=0&mode=notam` |

`rowID` is the IAA internal database id (e.g. `2003373`), distinct from the aviation-world ICAO NOTAM id (e.g. `A0337/26`). Both are present on the list page — ICAO id in `td.DivRecordID`, rowID embedded in the row's `onclick="rowClicked('2003373')"` handler.

### DOM contract

The scraper depends on these selectors; update them together if the upstream markup changes.

- **List page:**
  - Each NOTAM is a `<tr onclick="rowClicked('NNNNNNN')">`.
  - Inside that row: `td.DivRecordID` (ICAO id), `td.DivLocation` (airport or FIR code), `td.DivFirstBlueLine` (truncated E-line preview — not used by the scraper).
- **Detail page:**
  - Structured metadata spans: `#labelTitle`, `#LabelRow1`–`#LabelRow5`. Currently unused.
  - Body is a sequence of `<td class="DetailsBlueLine"><b>…</b></td>` cells, one per line of the raw ICAO block. The scraper concatenates them with `\n` to reconstruct the block.

## Cookie-jar lifecycle

Radware's Bot Manager sets a pile of cookies (`__uzma`, `__uzmb`, `__uzme`, `__uzmc`, `__uzmd`, `__uzmaj0`, `__uzmbj0`, `__uzmcj0`, `__uzmdj0`, `__uzmfj0`, `__uzmlj0`, `uzmxj`, `__ssds`, `__ssuzjsr0`, `TS01e4f122`, `TS18688158027`, `ASP.NET_SessionId`). Once a real browser has passed stormcaster's JS challenge for this IP, these cookies are valid for ~hours to a day.

The jar can come from three sources, in precedence order:

### 1. `IAA_COOKIE_JAR` env var (preferred in practice)

Parsed by `parseCookieHeader` in [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts). Value is the raw `Cookie:` header string (`name=value; name=value; …`) copied from DevTools. The env jar is used as the default starting point. If the WAF rejects it (list fetch or a worker), `getJar(true)` skips the env short-circuit and mints a fresh jar with Playwright — the env cookies aren't re-used after a rejection, since replaying them would just reproduce the failure.

Why this is the preferred path: headless Chromium (even with `navigator.webdriver` hidden, `window.chrome = {runtime:{}}`, locale/timezone set to `Asia/Jerusalem`) frequently fails the stormcaster challenge on IPs that have made previous programmatic requests. Radware escalates per-IP risk based on historical behaviour. A cookie pasted from a passing-in-anger human browser carries the "human" signal and keeps working for its cookie lifetime.

### 2. Module-scoped cache (`cachedJar`)

If a jar was minted in this process less than `JAR_TTL_MS` (15 min) ago, reuse it without re-launching Chromium. The cache is module-level, so it survives across `GET /api/notams` calls as long as the Node process is alive.

### 3. Fresh Playwright mint

`mintJarWithBrowser()` launches headless Chromium with:

```ts
args: [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
]
```

and on every new page installs an `addInitScript` that redefines `navigator.webdriver`, `navigator.languages`, `navigator.plugins`, and `window.chrome`. Context options: `userAgent` = Chrome 147 macOS, `locale: 'en-US'`, `timezoneId: 'Asia/Jerusalem'`, `viewport: 1280×800`.

It then navigates `maiwelcome.aspx` → `maiNotam.aspx` → one `maiDetails.aspx` (picking the first `rowID` from the list). Both the list and the detail page are validated with `isListPageValid`/`isDetailPageValid` and retried up to 3× with a 4 s `waitForTimeout` between reloads, to give `stormcaster.js` time to complete its crypto challenge. If either page fails validation after the final reload, it throws `WafChallengeError` and the caller surfaces the error. (This list-page gate was added after a silent-failure bug: without it, a challenged list page left `rowID=null`, the detail check was skipped, and the mint returned challenge-only cookies that then failed on replay.) On success it reads `context.cookies()` into a `Map<string, string>`.

Concurrency-safety: the first call to `getJar(...)` sets `jarMintLock` to the in-flight promise; subsequent callers join it instead of launching a second browser. Even `forceRefresh=true` joins an in-flight mint (by design — the concurrent caller already asked for a fresh jar).

## Request protocol

Every HTTP call goes through `fetchWithCookies(url, jar, referer)`:

- Method: `GET`. No body, never.
- Cookie header: entries of the jar joined as `name=value; …`.
- `Set-Cookie` response headers are parsed (with a fallback for environments where `Headers#getSetCookie` isn't available) and merged back into the jar.
- Browser headers (Chrome 147, macOS):

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Accept-Language: en-US,en;q=0.9
Upgrade-Insecure-Requests: 1
sec-ch-ua: "Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "macOS"
sec-fetch-dest: document
sec-fetch-mode: navigate
sec-fetch-site: same-origin
sec-fetch-user: ?1
```

- Referer is always set to the previous step (`maiwelcome` → `maiNotam` → `maiDetails`) because Radware checks it.

**Matching the User-Agent to the pasted cookies matters.** If you pasted cookies from Chrome 147, the scraper's UA must say Chrome 147. A mismatched UA fingerprint can trigger re-challenge on reuse. When you update the cookies, also update `USER_AGENT` and the `sec-ch-ua` value if your browser version differs.

## Concurrency and pacing

`scrapeMobileNotams` calls `runPool(entries, worker, CONCURRENCY)` with `CONCURRENCY = 4`. Each worker:

1. Sleeps `MIN_JITTER_MS + random * (MAX_JITTER_MS - MIN_JITTER_MS)` ms (200–500 ms) before its request.
2. Fetches one detail page.
3. If it fails non-WAF, sleeps 800 ms and retries once.
4. If it fails WAF: `IAA_COOKIE_JAR` → throw (cookie refresh needed). Otherwise force-refresh the jar once per request (guarded by the `wafRefreshed` boolean) and retry.

With 114 list entries, a healthy jar, and no WAF hits, this completes in ~15–25 s on a typical connection. A cold Playwright mint adds ~10–15 s.

## Retry strategy

Summary of retry layers:

| Layer | Trigger | Action |
|---|---|---|
| List | `WafChallengeError` (HTTP 200 + Error-100 body or body < 20 KB) | `getJar(true)` once, retry list fetch. Force-refresh bypasses the env short-circuit and mints via Playwright. |
| Worker (non-WAF) | `HTTP != 200` or `Empty detail body` | `sleep(800)`, retry once. |
| Worker (WAF), first per scrape | `wafRefreshed` flag false | `getJar(true)` once per scrape (regardless of env-jar presence), retry the detail fetch. |
| Second attempt still WAF | Any | Throw `WafChallengeError` for that rowID → appears in `response.errors[]`. |

Failures do not abort the whole scrape — they become per-rowID strings in `errors[]` alongside the partial `notams[]` result.

## Failure modes

Known symptoms and what they mean:

- **Every fetch throws `WafChallengeError` even though the live site works in a browser.**
  Check whether a signal that's supposed to mark only challenge pages (historically `stormcaster.js`, now only the `<title>Error 100</title>`) is showing up on authenticated pages too. Radware has previously rolled out its probe script to successful responses; if `hasChallengeMarker` trips on a real page, `isListPageValid` rejects everything and the scraper loops through retries that all "fail". Validate by dumping `htmlLength` / `title` / individual markers inside the mint, as done during the 0.4.1 fix.
- **`count: 0`, errors contain `Radware WAF challenge returned for https://…`.**
  The env jar is rejected AND the Playwright mint also failed to clear the challenge. Common causes: host IP flagged by Radware (try from a different network), Playwright UA / `sec-ch-ua` drift from the version you last pasted cookies from, or a true upstream outage. Re-extract cookies from a real browser as the first remediation (see [docs/OPERATIONS.md](OPERATIONS.md) §Cookie-jar refresh).
- **`count: 0`, error is `List page parsed zero NOTAMs`.**
  The mobile list DOM changed (likely `td.DivRecordID` / `tr[onclick^="rowClicked"]` selectors). Update [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts) `parseList`.
- **`count` is close to the expected ~114 but a handful of entries are in `errors[]` with `fetch failed`.**
  Transient network glitches. The worker retries once at 800 ms; anything that fails both attempts lands in `errors[]`. Safe to ignore unless persistent.
- **Very large circles all over the map covering the basemap.**
  Not a scraping issue — see [src/components/MapView.tsx](../src/components/MapView.tsx) `FIR_SCALE_RADIUS_NM` rendering downgrade.

## Tuning constants

All in [src/lib/server/scraper-mobile.ts](../src/lib/server/scraper-mobile.ts):

| Constant | Value | Purpose |
|---|---|---|
| `CONCURRENCY` | `4` | Parallel detail fetches. Raising this risks Radware rate-escalation. |
| `MIN_JITTER_MS` / `MAX_JITTER_MS` | `200` / `500` | Per-request delay envelope. Lower = faster + riskier; higher = slower + safer. |
| `DETAIL_MIN_CHARS` | `4000` | Anything smaller is treated as a WAF challenge (the Error 100 page is ~45 KB, genuine detail pages are ~9–10 KB; this threshold covers truncated/empty responses). Measured via `html.length` (UTF-16 code units). |
| `LIST_MIN_CHARS` | `20000` | Same idea for the list page, which is normally ~78 KB. |
| `JAR_TTL_MS` | `15 * 60 * 1000` | How long a minted jar is reused before re-minting on a cold request. |
| `BROWSER_WARMUP_TIMEOUT_MS` | `45000` | Per-navigation timeout during Playwright mint (3 reloads × 4 s + navigation overhead). |

Do not raise `CONCURRENCY` above ~6 without testing — WAF escalation is stepped and sticky.
