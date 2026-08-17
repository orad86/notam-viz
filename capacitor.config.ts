import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.notamviz.app',
  appName: 'NOTAM Visualizer',
  webDir: 'out',
  ios: {
    contentInset: 'always',
    // Matches --paper. The web UI paints warm paper, so a navy shell here
    // flashes on every cold start before the webview draws.
    backgroundColor: '#f5f1e7',
    limitsNavigationsToAppBoundDomains: false,
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
