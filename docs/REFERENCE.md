# Reference

Authoritative shape of the data model, Q-code decoding tables, and the one API the app exposes.

## Contents
- [Data model](#data-model)
- [Geometry union](#geometry-union)
- [Q-code decoding](#q-code-decoding)
- [Category mapping](#category-mapping)
- [Coordinate formats](#coordinate-formats)
- [API: GET /api/notams](#api-get-apinotams)

## Data model

All shapes live in [src/types/notam.ts](../src/types/notam.ts). Types:

```ts
type NotamCategory =
  | 'airspace'
  | 'obstacle'
  | 'navaid'
  | 'runway'
  | 'airport'
  | 'procedure'
  | 'military'
  | 'other';

interface NotamDetails {
  notamId: string;                // ICAO id, e.g. "A0337/26"
  fir: string;                    // Q-line [0], e.g. "LLLL", "LLBG"
  qCode: string;                  // Q-line [1], full 5 letters e.g. "QMRXX"
  qCodeExplanation?: string;      // Human-readable "Subject - Condition"
  significance?: string;          // Q-line [2] — IV / I / V
  priority?: string;              // Q-line [3] — NBO / SIB / T
  scope?: string;                 // Q-line [4] — A / E / W
  lowerLimit?: string;            // Q-line [5] — flight level string
  upperLimit?: string;            // Q-line [6] — flight level string
  location?: string;              // A-line raw text (aerodrome/FIR)
  bLine?: string;                 // B-line raw text (YYMMDDHHMM)
  effective: string;              // ISO-8601 parsed from bLine
  cLine?: string;                 // C-line raw text (YYMMDDHHMM or PERM)
  expires: string | 'PERM';       // ISO-8601 or literal "PERM"
  dLine?: string;                 // D-line (diurnal schedule)
  eItem: string;                  // Full E-line body text
  fLine?: string;                 // F-line (lower altitude, human-readable)
  gLine?: string;                 // G-line (upper altitude, human-readable)
}

interface ParsedNotam extends NotamDetails {
  subject: string;                // 2-letter Q-code subject, e.g. "MR"
  geometry: NotamGeometry;
  category: NotamCategory;
  isActive: boolean;              // effective <= now && (PERM || expires > now)
  title: string;                  // "{subject} {first 80 chars of eItem}"
  rawText: string;                // Full raw ICAO block
}

interface NotamApiResponse {
  notams: ParsedNotam[];
  fetchedAt: string;              // ISO-8601
  source: string;                 // Upstream URL
  count: number;                  // notams.length
  errors?: string[];              // Per-NOTAM and global errors
}
```

Field origins:

| Field | Source | Notes |
|---|---|---|
| `notamId` | First ICAO id match in the raw block (regex `[A-Z]\d{4}\/\d{2}`) | |
| `fir`, `qCode`, `significance`, `priority`, `scope`, `lowerLimit`, `upperLimit` | Q-line split on `/` | Positions 0, 1, 2, 3, 4, 5, 6 |
| `subject` | `decodeQCode(qCode).subjectCode` | 2nd–3rd letters of `qCode` |
| `qCodeExplanation` | `formatQCodeExplanation(qCode)` | See [Q-code decoding](#q-code-decoding) |
| `location` | `extractItem(raw, 'A')` | A-line, e.g. "LLBG", "LLLL" |
| `bLine` / `cLine` / `dLine` / `fLine` / `gLine` | `extractItem(raw, letter)` | Raw text; regex stops at next field marker |
| `effective` / `expires` | `parseNotamDate(bLine/cLine)` | YYMMDDHHMM → JS `Date` → ISO-8601; `C) PERM` preserved as literal `"PERM"` |
| `eItem` | `extractItem(raw, 'E')` | Multi-line text kept intact |
| `geometry` | First of: body coords, Q-line last segment, airport-coords lookup on `aItem`/`fir`, else `null` | See [Geometry union](#geometry-union) |
| `category` | `determineCategory(qLine, eItem)` | See [Category mapping](#category-mapping) |
| `isActive` | Computed | `effective <= now` AND (`PERM` or `expires > now`) |
| `title` | Derived | `"{subject} {eItem.substring(0, 80)}"` |
| `rawText` | Raw input block | The concatenated `DetailsBlueLine` text from the mobile detail page |

There is also an undeclared field `id: string` added in [src/lib/notam-parser.ts:167](../src/lib/notam-parser.ts#L167) for backwards compatibility with components that read `notam.id`. It's a duplicate of `notamId`; the `NotamDetails` type does not declare it, so `tsc --noEmit` reports errors in components that use it. See [docs/ROADMAP.md](ROADMAP.md).

## Geometry union

```ts
type NotamGeometry =
  | { type: 'point';      lat: number; lon: number }
  | { type: 'circle';     lat: number; lon: number; radiusNm: number }
  | { type: 'polygon';    vertices: Array<[number, number]> }      // [lat, lon]
  | { type: 'multipoint'; points:   Array<[number, number]> }      // [lat, lon]
  | null;
```

Selection logic in [src/lib/notam-parser.ts](../src/lib/notam-parser.ts) `parseNotamBlock`:

1. **`extractCoordinatesFromBody(eItem)`** (body). Returns `null` if no coords; `point` if one; `polygon` if several and the vertex order does not self-intersect; `multipoint` if it does self-intersect (detected by pairwise edge intersection test in `isSelfIntersectingPolygon`).
2. Falls back to **`parseQLineCoordinate(last Q-line segment)`**. Returns `point` if radius is 0, `circle` if ≥ 1 NM.
3. Falls back to **`getAirportCoords(aItem) || getAirportCoords(fir)`**. Returns a `point` at the airport/FIR center.
4. Otherwise `null`.

Rendering behaviour:
- **Point:** default Leaflet marker.
- **Circle:** `L.Circle` in projected meters. Capped at 200 NM visual radius. Circles ≥ `FIR_SCALE_RADIUS_NM` (150 NM, in [src/lib/notam/format.ts](../src/lib/notam/format.ts)) downgrade to a `CircleMarker` dot at the centre to avoid covering the whole basemap.
- **Polygon:** filled `L.Polygon` with per-category colour, fill opacity 0.15 (0.35 when selected).
- **Multipoint:** one small filled `CircleMarker` per coordinate — honest visualization of "these points are listed but their relationship isn't a valid polygon".

## Q-code decoding

Q-codes are the 5-letter codes at the start of the Q-line (`QFALC`, `QMRXX`, `QWULW`, …). The 2nd–3rd letters are the **subject code** (what the NOTAM is about) and the 4th–5th are the **condition code** (what happens to it).

The full lookup tables live in [src/lib/qcode-decoder.ts](../src/lib/qcode-decoder.ts):

- `SUBJECT_CODES` — ~140 entries across Airspace (`A*`), Communications (`C*`), Facilities (`F*`), Lighting (`L*`), Movement areas (`M*`), Navigation (`N*`), Obstacles (`O*`), Procedures (`P*`), Restrictions (`R*`).
- `CONDITION_CODES` — ~35 entries: `CA` (activated), `CC` (changed course), `CF` (changed frequency), `CN` (canceled), `LC` (closed), `LI` (closed IFR), `AS` (unserviceable), `HA`/`HB`/`HC` (braking action), `HV` (volcanic ash), `XX` (plain language), etc.

`formatQCodeExplanation(qCode)` returns `"{subjectDescription} - {conditionDescription}"`. Unknown codes return `"Unknown subject code: {code}"` rather than failing.

## Category mapping

`determineCategory(qLine, eItem)` in [src/lib/notam-parser.ts](../src/lib/notam-parser.ts):

1. `getCategoryFromQLine(qLine)` — extracts the Q-code 2nd–3rd letters and looks up `Q_CODE_SUBJECT_MAP` in [src/lib/qcode-subjects.ts](../src/lib/qcode-subjects.ts).
2. If the lookup returns `'other'`, fall back to substring checks on `eItem + qLine` (upper-cased):

| Keyword hit | Category |
|---|---|
| `RUNWAY`, `RWY`, `THR`, `APRON` | `runway` |
| `OBSTACLE`, `CRANE`, `TOWER`, `WIND FARM` | `obstacle` |
| `NAVAID`, `VOR`, `NDB`, `BEACON` | `navaid` |
| `REFUEL`, `STAND`, `PARKING`, `APRON` | `airport` |
| `MILITARY`, `RESTRICTED`, `DANGER` | `military` |
| `PROCEDURE`, `APPROACH`, `ARRIVAL`, `DEPARTURE` | `procedure` |
| `AIRSPACE`, `CLSD`, `AREA`, `BOUNDARY`, `EGYPT`, `LEBANON` | `airspace` |
| (none) | `other` |

Subject → category rules in `Q_CODE_SUBJECT_MAP`:

| Q-code subject prefix | Category |
|---|---|
| `AA–AF`, `AO`, `CA–CE`, `RA` | `airspace` |
| `FA–FW`, `LA–LX` | `airport` |
| `MA–MW` | `runway` |
| `NA–NT` | `navaid` |
| `OB–OW` | `obstacle` |
| `PA–PW` | `procedure` |
| `RD`, `RM`, `RP`, `RR`, `RZ` | `military` |

**Bug note.** `getCategoryFromQLine` is currently buggy — it extracts the 4 letters *after* `Q` and then takes `substring(1, 3)` of that, which returns letters 1–2 out of 4 (so `QFALC` → `AL` not `FA`). Many NOTAMs fall through to the keyword fallback or land in `other`. See [docs/ROADMAP.md](ROADMAP.md) §Technical debt.

## Coordinate formats

NOTAM coordinates arrive in several formats that the parsers in [src/lib/coord-parser.ts](../src/lib/coord-parser.ts) accept:

| Format | Example | Where |
|---|---|---|
| DMS with separators | `315148N/0350503E/012` | Q-line last segment |
| DMS compact | `315148N0350503E012` | Q-line last segment |
| DM with separators | `3149N/03458E/001` | Q-line last segment (A-NOTAMs) |
| DMS prefix | `N314945E0345822` | Body, "PSN" lists |
| DMS suffix | `315148N0350503E` | Body, "PSN" lists |
| DMS with decimal sec | `314945.50N0345822.10E` | Rare |
| DM only | `3149N03458E` | Body fallback |

`parseQLineCoordinate` tries three regexes in order (DMS-separated → DMS-compact → DM). `extractCoordinatesFromBody` runs PSN-prefixed patterns first (pattern 1a, 1b), then a standalone-prefix pattern (1c), then broader fallbacks (compact, separated, DM). All matches pass `isValidIsraeliCoord` (lat 27–36, lon 32–38) before being accepted.

## API: GET /api/notams

One endpoint. Handler: [src/app/api/notams/route.ts](../src/app/api/notams/route.ts).

- **Method:** `GET`.
- **Auth:** none (public feed).
- **Rate limit:** 30 req/min per client IP, sliding window via `@upstash/ratelimit`. Exceeded → 429 (see below).
- **Runtime:** `nodejs`. The route reads request headers for rate-limiting, which makes it dynamic — ISR / revalidate do not apply.
- **Cache:** on success, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (1 h fresh + 24 h stale-while-revalidate at the CDN edge).
- **Response body:** `NotamApiResponse`.

### Success response (HTTP 200)

Trimmed example from a live call:

```json
{
  "count": 114,
  "fetchedAt": "2026-04-20T08:03:33.645Z",
  "source": "https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx",
  "notams": [
    {
      "notamId": "A0338/26",
      "id": "A0338/26",
      "fir": "LLLL",
      "qCode": "QFALC",
      "qCodeExplanation": "Facility - Aerodrome - Closed",
      "significance": "IV",
      "priority": "NBO",
      "scope": "A ",
      "lowerLimit": "000",
      "upperLimit": "999",
      "location": "LLBG",
      "bLine": "2604241500",
      "cLine": "2604241955",
      "dLine": "",
      "fLine": "",
      "gLine": "",
      "subject": "FA",
      "geometry": {
        "type": "circle",
        "lat": 32.016666666666666,
        "lon": 34.88333333333333,
        "radiusNm": 5
      },
      "effective": "2026-04-24T12:00:00.000Z",
      "expires": "2026-04-24T16:55:00.000Z",
      "eItem": "AD CLSD DUE WIP.)",
      "category": "airport",
      "isActive": false,
      "title": "FA AD CLSD DUE WIP.)",
      "rawText": "(A0338/26 NOTAMN\nQ) LLLL/QFALC/IV/NBO/A /000/999/3201N03453E005\nA) LLBG B) 2604241500 C) 2604241955\nE) AD CLSD DUE WIP.)"
    }
  ]
}
```

`errors` is omitted when empty. When present it is `string[]`, one entry per failure. Representative entries:

- `"Detail fetch failed for A0012/26 (2003012): fetch failed"` — transient network error after the 800 ms retry.
- `"Radware WAF challenge returned for https://brin.iaa.gov.il/MobileAeroinfo/maiDetails.aspx?rowID=…&scrpos=0&mode=notam"` — WAF escalated mid-scrape and both the initial cookie jar and the Playwright-minted refresh failed. When only the env cookies were stale, the scraper auto-refreshes via Playwright and you will not see this error.
- `"Parser returned null for a block"` — a detail page's reconstructed block lacked a NOTAM id regex match.
- `"Listed 114 NOTAMs but parsed zero blocks"` — global sanity check when all detail fetches failed.

### 429 Too Many Requests

Returned when the per-IP rate-limit bucket (30/min) is exhausted. Headers:

```
Retry-After: <seconds until reset>
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
Cache-Control: no-store
```

Body is a `NotamApiResponse` shell with `count: 0` and a single entry in `errors` noting the retry window.

### 503 Service Unavailable

Returned when the KV store holds no snapshot yet (fresh deploy, or the scrape workflow hasn't run). Body:

```json
{
  "notams": [],
  "fetchedAt": "<iso>",
  "source": "https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx",
  "count": 0,
  "errors": ["No cached NOTAMs in KV yet — run the scrape workflow"]
}
```

with `Cache-Control: no-store`.

### 500 Internal Server Error

Returned when KV reads throw (transient Upstash failure, etc.). Body shape:

```json
{
  "notams": [],
  "fetchedAt": "<iso>",
  "source": "https://brin.iaa.gov.il/MobileAeroinfo/maiNotam.aspx",
  "count": 0,
  "errors": ["<single error message>"]
}
```

with `Cache-Control: no-store`. The response is still shaped as `NotamApiResponse`, so clients can parse it uniformly across all statuses.
