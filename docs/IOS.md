# iOS app

`notam-viz` ships on the App Store as a Capacitor wrapper around a static
export of the Next.js UI. The UI, parsers, and export pipeline are reused
as-is; only the `/api/notams` endpoint is hosted on Vercel and called over
HTTPS from the app bundle.

## Version pins

Capacitor is on the **v8 family**, which requires **Node 22** (see
`engines.node` and `.nvmrc`) and **Xcode 26+**. The Podfile platform is
`15.0`, the Capacitor 8 minimum; the App target itself deploys to 15.6.

The move from v7 came from the Android side: Google Play requires target API
36, which only Capacitor 8 supports. See [ANDROID.md](ANDROID.md).

Capacitor 8.5 adopts UIScene on iOS. `ios/App/App/SceneDelegate.swift` and
the `UIApplicationSceneManifest` key in `Info.plist` come from that
migration; do not remove them.

## One-time setup

```
npm i
NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run native:build
npx cap add ios
cd ios/App && pod install && cd ../..
```

After `npx cap add ios` creates `ios/App/`, one step still requires the
Xcode GUI:

1. Open `ios/App/App.xcworkspace`.
2. Right-click the `App` group in the Project Navigator → **Add Files to "App"**.
3. Select `ios/App/App/PrivacyInfo.xcprivacy`, ensure the `App` target is
   ticked, click **Add**. Apple requires this file to be in the app target
   so the privacy manifest ships inside the IPA.

The Info.plist keys, display name, app icon (1024×1024 unified), and
Capacitor config are applied automatically by `npm run ios:build` +
`cap sync`.

## Build & run

```
NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run ios:build
npm run ios:open
```

Then pick a simulator or a signed device in Xcode and hit Run.

## Release checklist

- [ ] Apple Developer Program enrollment, bundle id `il.notamviz.app`.
- [ ] App Store Connect listing: screenshots (6.7" 1290x2796, 6.1" 1179x2556),
      description, keywords, privacy policy URL (`/privacy` page), support URL.
- [ ] Privacy nutrition label: "Data Not Collected".
- [ ] Age rating: 4+. Category: Navigation (primary), Utilities (secondary).
- [ ] Export compliance: ITSAppUsesNonExemptEncryption = false.
- [ ] TestFlight internal build, then one external tester, then submit.

## Notes

- Geolocation is the primary native capability; App Store guideline 4.2.3
  (the "just a website wrapper" rule) is mitigated by the location feature,
  the bundled static UI, the native share sheet wired into exports, and
  haptics on selection.
- The scraper, Upstash KV, and rate limiter stay on Vercel. They are not
  bundled into the iOS IPA.
- The Android shell is the same project and the same static bundle. See
  [ANDROID.md](ANDROID.md).
