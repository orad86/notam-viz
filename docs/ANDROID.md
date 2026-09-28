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

## Play Console release checklist

- [ ] Google Play developer account, identity verified. A personal account
      created after November 2023 must run a closed test with at least 12
      testers for 14 continuous days before it can promote to production.
- [ ] Create the app: name "NOTAM Visualizer", package `il.notamviz.app`,
      free, category **Maps & Navigation**.
- [ ] Enrol in Play App Signing on the first upload; export and keep the
      upload certificate.
- [ ] Store listing: short description (80 chars), full description (4000),
      512x512 icon (`public/icons/play-icon-512.png`), 1024x500 feature
      graphic, at least two phone screenshots, tablet screenshots if tablets
      are targeted.
- [ ] App content — privacy policy URL `https://notam.aero-logic.org/privacy`.
- [ ] App content — **Data safety: no data collected, no data shared.**
      Location is read on the device to draw the aircraft marker and is never
      transmitted, so it is "used" but not "collected". The rate limiter sees
      request IPs at the Vercel edge; that is infrastructure logging, not
      collection by the app. `PRIVACY.md` is the wording to match.
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
