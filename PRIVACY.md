# NOTAM Visualizer — Privacy Notice

**Effective Date**: 2026-11-03
**Version**: 1.2

NOTAM Visualizer is a public, read-only viewer, available as a website and as native apps for iOS and Android. It does not offer accounts and does not collect profile information. This notice describes the limited operational data the Service handles, and applies equally to the website and to both apps.

## 1. What we do not collect

- No user accounts, passwords, or authentication tokens.
- No name, email, phone, or contact details.
- No pilot profile, aircraft information, or flight plan data.
- No advertising identifiers.
- No third-party analytics scripts, and no tracking of individual users. See section 2.6 for the anonymous usage counts we keep.
- No cookies set by the application itself.
- No device location. See section 2.4.

## 2. What we do process

### 2.1. IP address for rate limiting

The `/api/notams` endpoint applies a per-IP rate limit of 30 requests per minute, backed by Upstash Redis. Your IP address is used only to enforce this limit. Rate-limit entries expire on the order of a minute and are not used for profiling or for the usage counts in section 2.6.

### 2.2. Platform request logs

The hosting platform (Vercel) produces standard request logs — IP, user agent, method, path, status, timing — for the purpose of running and debugging the Service. These logs are retained under Vercel's default retention policy.

### 2.3. Application logs

The Service emits structured operational logs (for example, `scrape.list.fetched`, `api.notams.served`) for debugging. These logs record counts, durations, and failure reasons. They do not record IP addresses or any personally identifying information.

### 2.4. Device location

If you turn on the position layer, the app asks your device for your location and draws an aircraft marker and an accuracy circle on the map. This happens entirely on your device.

Your location is never transmitted, never stored, and never reaches the Service's servers or any third party. It is held in memory only while the layer is on, and discarded when you turn it off or close the app. The feature is optional; the map and every other feature work without it, and you can decline or revoke the permission at any time in your device settings.

For the purposes of Apple's privacy nutrition label and Google Play's Data safety form, location is **used but not collected**.

### 2.5. Files you export

Exports to PDF, GPX, and KML are generated on your device from data already on screen. In the apps they are written to your device's Documents folder and offered to the system share sheet, which you control. Nothing about an export is sent to the Service.

### 2.6. Anonymous usage counts

To understand when and on which platform the Service is used, the server counts each time the NOTAM feed is loaded (once per app or website start). Each load adds one to a set of totals:

- the hour (Israel time) and the platform: iOS app, Android app, website, or automated client;
- the city, as estimated by the hosting platform from the request's IP address.

Only these running totals are stored, in Upstash Redis, and they are deleted after 400 days. Your IP address, user agent, device identifiers and the time of any individual visit are not stored, and the totals cannot be linked back to you or to a device. Nothing is collected on your device and no cookie is set for this.

## 3. Data we publish

NOTAM content shown by the Service is published by the Israeli Airports Authority on its public mobile AeroInfo endpoint. NOTAM Visualizer mirrors that content and adds derived fields (parsed coordinates, category classification, human-readable summary). Every visitor sees the same snapshot.

## 4. Third parties

- **Vercel** — hosts the application and runs the scheduled scrape. Subject to Vercel's privacy practices.
- **Upstash (Vercel Marketplace)** — stores the NOTAM snapshot, the rate-limit counter, and the anonymous usage totals (section 2.6). Subject to Upstash's privacy practices.
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
