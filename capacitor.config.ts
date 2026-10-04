import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.notamviz.app',
  appName: 'NOTAM Visualizer',
  webDir: 'out',
  // Both shells paint --paper behind the webview. The web UI paints warm
  // paper, so a navy shell flashes on every cold start before the webview
  // draws.
  ios: {
    contentInset: 'always',
    backgroundColor: '#f5f1e7',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#f5f1e7',
    // Everything the app loads is HTTPS or bundled, so there is nothing to
    // downgrade. Keep the webview strict.
    allowMixedContent: false,
    // Flip to true locally to attach chrome://inspect. Never ship it on.
    webContentsDebuggingEnabled: false,
    // Play distributes app bundles, not APKs. Signing comes from
    // android/key.properties or ANDROID_KEYSTORE_* env vars, never from
    // this file, which is committed.
    buildOptions: {
      releaseType: 'AAB',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#f5f1e7',
      showSpinner: false,
    },
  },
};

export default config;
