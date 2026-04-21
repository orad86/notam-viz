# NOTAM Visualizer — Privacy Notice

**Effective Date**: 2026-04-21
**Version**: 1.0

NOTAM Visualizer is a public, read-only web viewer. It does not offer accounts and does not collect profile information. This notice describes the limited operational data the Service handles.

## 1. What we do not collect

- No user accounts, passwords, or authentication tokens.
- No name, email, phone, or contact details.
- No pilot profile, aircraft information, or flight plan data.
- No advertising identifiers.
- No third-party analytics scripts.
- No cookies set by the application itself.

## 2. What we do process

### 2.1. IP address for rate limiting

The `/api/notams` endpoint applies a per-IP rate limit of 30 requests per minute, backed by Upstash Redis. Your IP address is used only to enforce this limit. Rate-limit entries expire on the order of a minute and are not used for profiling.

### 2.2. Platform request logs

The hosting platform (Vercel) produces standard request logs — IP, user agent, method, path, status, timing — for the purpose of running and debugging the Service. These logs are retained under Vercel's default retention policy.

### 2.3. Application logs

The Service emits structured operational logs (for example, `scrape.list.fetched`, `api.notams.served`) for debugging. These logs record counts, durations, and failure reasons. They do not record IP addresses or any personally identifying information.

## 3. Data we publish

NOTAM content shown by the Service is published by the Israeli Airports Authority on its public mobile AeroInfo endpoint. NOTAM Visualizer mirrors that content and adds derived fields (parsed coordinates, category classification, human-readable summary). Every visitor sees the same snapshot.

## 4. Third parties

- **Vercel** — hosts the application and runs the scheduled scrape. Subject to Vercel's privacy practices.
- **Upstash (Vercel Marketplace)** — stores the NOTAM snapshot and the rate-limit counter. Subject to Upstash's privacy practices.
- **Israeli Airports Authority** — origin of the NOTAM content.
- **OpenStreetMap** — serves the base map tiles. When the map loads, your browser issues standard HTTPS requests to OpenStreetMap's tile servers, which may log IP and user agent under their policy.

## 5. Cookies and local storage

NOTAM Visualizer does not set its own cookies. The hosting platform may set short-lived operational cookies (for example, for request routing). The Service does not use client-side local storage to track you.

## 6. Changes to this notice

This notice may be updated. The "Effective Date" above reflects the current version. Material changes will be announced in the repository's release notes.

## 7. Contact

- **Developer**: Orad Eldar
- **Email**: orad@aero-logic.org

---

**© 2026 Orad Eldar. All Rights Reserved.**
