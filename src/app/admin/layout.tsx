import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Hidden by design: nothing in the app links here, it is not in robots.txt
// (that would advertise it), and the middleware adds X-Robots-Tag as well.
export const metadata: Metadata = {
  title: 'Usage — NOTAM Visualizer',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  // html/body are overflow:hidden for the map, so this page owns its scroll,
  // the same way DocsLayout does.
  return (
    <div className="bg-paper text-ink" style={{ height: '100dvh', overflowY: 'auto' }}>
      {children}
    </div>
  );
}
