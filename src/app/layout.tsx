import type { Metadata, Viewport } from 'next';
import { Fraunces, Assistant, Chivo_Mono } from 'next/font/google';
import './globals.css';
import RegisterSW from './register-sw';

// House typefaces, bound to --type-* in theme/notam-viz.css. Self-hosted by
// next/font, so the static iOS export carries them and no external font host
// is contacted at runtime.
//
// Fraunces takes `axes` and no `weight` — next/font rejects the two together
// on a variable font.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'WONK', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-assistant',
  display: 'swap',
});

const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-chivo-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NOTAM Visualizer',
  description: 'Interactive map visualization of Israeli IAA NOTAMs',
  manifest: '/manifest.webmanifest',
  applicationName: 'NOTAM Visualizer',
  appleWebApp: {
    capable: true,
    title: 'NOTAM Visualizer',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  // Matches --paper, so the iOS status bar and the PWA splash blend into the
  // page instead of banding against it.
  themeColor: '#f5f1e7',
  width: 'device-width',
  initialScale: 1,
  // Retained from v0.5.2: without these, iOS WKWebView double-tap-zooms the
  // page and rescales text on orientation change. Leaflet's own pinch/zoom is
  // unaffected — the map still zooms.
  //
  // This does cost page-level pinch-zoom, which is a WCAG 1.4.4 concern. Mobile
  // Safari has ignored `user-scalable=no` since iOS 10, so it only actually
  // binds inside the Capacitor shell. Left as-is rather than silently reverting
  // a deliberate fix; worth revisiting with a device in hand.
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${fraunces.variable} ${assistant.variable} ${chivoMono.variable}`}
    >
      <body className="contour bg-paper text-ink antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
