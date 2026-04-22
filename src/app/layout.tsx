import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import RegisterSW from './register-sw';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NOTAM IL',
  description: 'Interactive map visualization of Israeli IAA NOTAMs',
  manifest: '/manifest.webmanifest',
  applicationName: 'NOTAM IL',
  appleWebApp: {
    capable: true,
    title: 'NOTAM IL',
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
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased overflow-hidden`}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
