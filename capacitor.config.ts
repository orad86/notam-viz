import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'il.notamviz.app',
  appName: 'NOTAM Visualizer',
  webDir: 'out',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0f172a',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
  },
};

export default config;
