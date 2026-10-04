# Android app

`notam-viz` ships on Google Play as a Capacitor wrapper around a static
export of the Next.js UI. It is the same bundle the iOS app carries, built by
the same script, calling the same `/api/notams` on Vercel over HTTPS. See
[IOS.md](IOS.md) for the iOS shell; everything not specific to Android is
shared between them.

## Version pins

| | |
| --- | --- |
| Capacitor | v8 family |
| Node | 22+ (`engines.node`; `.nvmrc`) |
| JDK | 17-21. **Not 24 or 25** — Gradle 8.14 rejects their class file version. |
| Android Studio | Otter (2025.2.1) or newer |
| `minSdkVersion` | 30 (Android 11) |
| `compileSdkVersion` / `targetSdkVersion` | 36 (Android 16) |

Capacitor moved to the v8 family in v0.7.4 specifically to get here. Google
Play requires new apps and updates to target API 36, and Capacitor Android
does not support a target SDK other than the one its major version ships
with, so API 36 means Capacitor 8, which means Node 22.

**Check the target API requirement before every submission.** Play raises it
roughly annually, and the Console's Policy status page is the authority.
Raising it is a Capacitor major version bump, not a one-line Gradle edit.

`minSdkVersion` is 30 rather than Capacitor's default 24 because exports are
written to the public Documents folder. From API 30 an app can write its own
files there with no storage permission, so `src/lib/export/download.ts` needs
no Android-specific branch. Lowering it would mean adding
`WRITE_EXTERNAL_STORAGE` with `android:maxSdkVersion="29"` plus a runtime
request.

SDK versions live in `android/variables.gradle`.

## One-time setup

```
npm i
NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run native:build
npx cap add android
```

`npx cap add android` scaffolds `android/` from the Capacitor template, which
is close but not correct for this app. `android-templates/` is the source of
truth for every hand-edit applied on top, and each file there explains why:

| Template | Applied to |
| --- | --- |
| `AndroidManifest.additions.xml` | `android/app/src/main/AndroidManifest.xml` |
| `styles.additions.xml` | `android/app/src/main/res/values/styles.xml` (plus a new `colors.xml`) |
| `file_paths.additions.xml` | `android/app/src/main/res/xml/file_paths.xml` |
| `build.gradle.signing.snippet` | `android/app/build.gradle` |
| `key.properties.example` | copied to `android/key.properties`, never committed |

`android/` is committed, like `ios/`, so this scaffolding only happens once.
Build output, Gradle state, `local.properties`, the synced web bundle and all
signing material are gitignored.

### Signing key

```
mkdir -p ~/keys && chmod 700 ~/keys
keytool -genkeypair -v \
  -keystore ~/keys/notam-viz-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android-templates/key.properties.example` to `android/key.properties`
and fill in the path and the two passwords. Keep the keystore itself outside
the repo. `android/app/build.gradle` reads that file first and falls back to
`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD`; with neither configured it emits an unsigned bundle
rather than failing, which is what a debug-only checkout should get.

This is the **upload key**. Play App Signing holds the actual app signing key
once you enrol on the first upload, so losing this one is recoverable through
Google support, but back it up anyway.

## Build & run

```
NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run android:build
npm run android:open
```

Then pick an emulator or a connected device in Android Studio and hit Run.
Use an API 36 image; that is what the app targets.

`npm run android:build` runs the shared `scripts/native-build.mjs`: it moves
`src/app/api` aside (`output: 'export'` does not emit route handlers),
builds, regenerates icons, and runs `cap sync android`. Passing no platform
argument syncs every scaffolded platform at once.

To inspect the webview, set `webContentsDebuggingEnabled: true` in the
`android` block of `capacitor.config.ts`, re-sync, and attach
`chrome://inspect`. Do not commit it on.

Gradle needs a JDK in the 17-21 range on `JAVA_HOME`. Android Studio's
bundled runtime is too new:

```
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug
```

## Release build

```
npm run android:aab
```

The bundle lands at `android/app/build/outputs/bundle/release/app-release.aab`.
Verify it is signed with `jarsigner -verify` before uploading.

### Version numbers

`versionName` and `versionCode` live in `android/app/build.gradle` and are
deliberately decoupled from `package.json`, whose patch version moves once
per PR.

- `versionName` tracks the iOS `MARKETING_VERSION` so the two store listings
  agree. Currently `1.1`.
- `versionCode` is a Play-only counter. Bump it by one on **every** upload to
  **any** track. Play rejects a reused value, and the number never goes down.

Both are edited by hand. Nothing syncs them.

## First release, step by step

1. **Create the upload key** (once, never again):

   ```
   mkdir -p ~/keys && chmod 700 ~/keys
   keytool -genkeypair -v \
     -keystore ~/keys/notam-viz-upload.jks \
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Copy `android-templates/key.properties.example` to `android/key.properties`
   and fill in the absolute path and the two passwords. Back the `.jks` and the
   passwords up somewhere encrypted. Neither file is ever committed.

2. **Build the signed bundle:**

   ```
   export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
   export JAVA_HOME=/opt/homebrew/opt/openjdk@21
   NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run android:build
   npm run android:aab
   $JAVA_HOME/bin/keytool -printcert -jarfile \
     android/app/build/outputs/bundle/release/app-release.aab | grep Owner
   ```

   Both exports are required in every new shell. Without Node 22 the
   Capacitor sync is skipped and the bundle ships stale assets; without
   `JAVA_HOME` on JDK 21 Gradle fails with "Cannot find a Java installation
   matching languageVersion=21". The last command must show your own name in
   `Owner`. Do not rely on `jarsigner -verify` alone: it passes for any signer,
   including a leftover test key, and for a stale bundle from an earlier build. If Gradle complains about an
   incomplete signing config, it names the missing field.

3. **Generate the listing assets:** `npm run play:assets`.

4. **Create the app** in the Play Console: "NOTAM Visualizer", English (or
   Hebrew) as default language, App, Free.

5. **Upload to Internal testing first**, not Production. Internal testing has
   no review wait, so it is where you find out whether the bundle is accepted
   and whether the app runs on real hardware. Accept Play App Signing when
   prompted on this first upload.

6. **Fill in everything under App content.** Play will not let you promote a
   release until all of it is green. The Data safety answers are the ones
   worth getting right the first time; see the checklist below.

7. **Complete the store listing** with the assets from step 3.

8. **Closed testing, if your account requires it.** A personal developer
   account created after November 2023 must run a closed test with at least 12
   testers who stay opted in for 14 continuous days. This is a wall-clock
   wait, not a review queue, so start it as early as possible.

9. **Promote to Production.** First review typically takes a few days. Every
   later upload needs `versionCode` bumped by one.

### Draft listing copy

Short description (80 characters max):

```
Israeli IAA NOTAMs on an interactive map. Filter by route, altitude and time.
```

Full description, as a starting point. Keep the "not for operational flight
planning" line: it matches the in-app disclaimer and the support page, and an
aviation app that overclaims invites a policy problem.

```
NOTAM Visualizer plots Israeli Airports Authority NOTAMs on an interactive
map, so you can see at a glance what is happening in the airspace you care
about.

- Every current NOTAM drawn as its real footprint: circles, polygons and
  points, not just a list of codes.
- Tap any shape to read the full text, with the Q-code and ICAO contractions
  decoded into plain language.
- Overlapping NOTAMs are resolvable. Tap a crowded area and step through
  every notice under your finger.
- Filter by free text, category, altitude band, time window, or a route
  corridor between two points.
- Reference layers for airports, navaids, VFR waypoints and IFR
  intersections.
- Export a selection to PDF, GPX or KML and share it anywhere.
- Show your own position on the map. Your location is read on the device and
  never transmitted.
- No accounts, no ads, no analytics, no tracking.

IMPORTANT: NOTAM Visualizer is for situational awareness only. It is not a
certified aeronautical product and is not a substitute for an official
pre-flight briefing. Always consult official IAA sources before any flight.
```

## Listing assets

```
npm run play:assets
```

Writes to `play-assets/` (gitignored): the 1024x500 feature graphic Play
requires, a 512x512 app icon, and every screenshot in
`play-assets/screenshots/src/` flattened and checked against Play's rules.

Play rejects images with an alpha channel and caps screenshots at a **2:1**
aspect ratio. A Pixel 7 is 1080x2400, which is 2.22:1, so raw captures are
rejected. Capture at 1080x1920 instead:

```
adb shell wm size 1080x1920 && adb shell wm density 420
adb exec-out screencap -p > play-assets/screenshots/src/01-map.png
adb shell wm size reset && adb shell wm density reset
```

The script prints `REJECTED BY PLAY` with the reason for any source image
that would not pass, so check its output before uploading.

## Play Console release checklist

- [ ] Google Play developer account, identity verified. A personal account
      created after November 2023 must run a closed test with at least 12
      testers for 14 continuous days before it can promote to production.
      Budget that time; it is the long pole in a first release.
- [ ] Create the app: name "NOTAM Visualizer", package `il.notamviz.app`,
      free, category **Maps & Navigation**.
- [ ] Enrol in Play App Signing on the first upload; export and keep the
      upload certificate.
- [ ] Store listing: short description (80 chars), full description (4000),
      and the assets from `npm run play:assets`.
- [ ] App content — privacy policy URL `https://notam.aero-logic.org/privacy`.
- [ ] App content — **Data safety: decide this deliberately, do not
      default to "no data collected".** Location is read on the device to draw
      the aircraft marker and is never transmitted, so it needs no
      declaration. The open question is the IP address. Play only treats
      off-device data as not collected when it is processed *ephemerally*: held
      in memory, kept no longer than the request needs, and used for nothing
      else. The rate-limit counter expires within about a minute and plausibly
      qualifies, but `PRIVACY.md` section 2.2 says Vercel keeps request logs
      (IP, user agent, path) under its default retention, and stored logs do
      not qualify. Answer the form to match what that section says, or the
      policy and the form will contradict each other on review. Read
      [Play's Data safety help](https://support.google.com/googleplay/android-developer/answer/10787469)
      for the category that covers IP addresses before answering. The App
      Store's "Data Not Collected" label in [IOS.md](IOS.md) rests on the same
      assumption and deserves the same check.
- [ ] App content — no ads, no in-app purchases; content rating (IARC)
      questionnaire; target audience adults; not a news, government, health
      or financial app.
- [ ] Contact email and support URL `https://notam.aero-logic.org/support`.
- [ ] Policy status: confirm the target API level requirement is met.
- [ ] Internal testing, then closed testing, then production. Bump
      `versionCode` for each upload.
- [ ] Read the Pre-launch report for crashes and permission-prompt findings.

## Notes

- **Geolocation is the primary native capability.** Play's "minimum
  functionality" policy, the analogue of App Store guideline 4.2.3, is
  mitigated the same way: the location feature, the bundled offline-capable
  UI, and the native share sheet wired into exports.
- The position layer calls `navigator.geolocation` directly rather than using
  `@capacitor/geolocation`. Capacitor's `BridgeWebChromeClient` turns the
  webview's request into a real runtime prompt, but **only if the manifest
  declares the permissions**. Without them Android refuses silently and the
  layer reports "denied" with nothing on screen to explain it.
- The webview origin is `https://localhost` on Android and
  `capacitor://localhost` on iOS. `/api/notams` sends
  `Access-Control-Allow-Origin: *`, which covers both.
- The service worker network-firsts `/api/notams` on its **own** origin, so
  in the shell, where the API is an absolute Vercel URL, that path is inert.
  The app shell caches; NOTAM data does not. Same as iOS.
- The hardware back button closes the app at the root rather than dismissing
  an open detail sheet or modal. Accepted for the first release; tracked in
  [ROADMAP.md](ROADMAP.md).
- No dark mode. The shell theme is pinned to the light AppCompat parent so a
  device in dark mode cannot paint a dark window behind the light UI.
- The scraper, Upstash KV and rate limiter stay on Vercel. None of them are
  bundled into the AAB.
