import type { Metadata } from 'next';
import Link from 'next/link';
import DocsLayout from '@/components/DocsLayout';

export const metadata: Metadata = {
  title: 'Support — NOTAM Visualizer',
  description:
    'Help and instructions for using NOTAM Visualizer — the Israeli IAA NOTAM map viewer.',
};

const SUPPORT_EMAIL = 'orad@aero-logic.org';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 font-display text-lg font-semibold text-ink">{children}</h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-3 text-sm leading-relaxed text-ink-2">{children}</p>
  );
}

export default function SupportPage() {
  return (
    <DocsLayout title="Support">
      <P>
        NOTAM Visualizer plots Israeli IAA Notices to Airmen on an interactive map. This
        page explains how the app works and how to reach the developer if
        something looks wrong.
      </P>

      <div className="my-4 rounded-sm border border-warn/40 bg-warn-wash p-3 text-sm text-ink-2">
        <strong>Important:</strong> NOTAM Visualizer is for situational awareness only.
        It is <strong>not</strong> a substitute for an official pre-flight
        briefing and must not be used for operational flight planning,
        navigation, or in-flight reference. Always consult the official IAA
        AIS website before any flight.
      </div>

      <H2>Quick start</H2>
      <ol className="my-3 ms-5 list-decimal space-y-1 text-sm text-ink-2">
        <li>Open the app — accept the disclaimer to continue.</li>
        <li>
          The map shows every NOTAM in the current snapshot. Tap any shape
          (circle, polygon, or marker) to read the full text.
        </li>
        <li>
          Open the sidebar (☰ on mobile) to see the list, filter, and route
          tools.
        </li>
      </ol>

      <H2>Filtering NOTAMs</H2>
      <P>
        The filter bar at the top of the sidebar lets you narrow the list by
        text, category, active-only, and time window:
      </P>
      <ul className="my-3 ms-5 list-disc space-y-1 text-sm text-ink-2">
        <li>
          <strong>Search</strong> — matches any word in the NOTAM ID, location,
          or body text.
        </li>
        <li>
          <strong>Time window</strong> (🕐) — Now, 2 h, 24 h, 7 d, or a custom
          start/end. NOTAMs whose validity overlaps the window are kept.
        </li>
        <li>
          <strong>Category chips</strong> — airspace, obstacle, navaid, runway,
          airport, procedure, military, or other (derived from the Q-code).
        </li>
        <li>
          <strong>Active only</strong> — hide NOTAMs that are not currently in
          force.
        </li>
        <li>
          <strong>Sort</strong> (⇅) — by ID, effective date, or expiry.
        </li>
      </ul>

      <H2>Planning a route</H2>
      <P>
        Use the route box at the top of the sidebar. Type or pick airports,
        navaids, or VFR/IFR waypoints (e.g. <code>LLBG MIKLA LLHA</code>). The
        map draws your track plus a 1 km corridor, and the list narrows to
        NOTAMs that intersect the corridor and (optionally) your altitude
        band. Clear the route to restore the full list.
      </P>

      <H2>Selecting and exporting</H2>
      <P>
        Tap the checkbox in any list row or popup to add a NOTAM to your
        selection. The selection counter appears at the top of the sidebar and
        on the map. Use the ⬇ pill in the filter bar to export your selection
        — or, if nothing is selected, the current filtered view — as PDF, GPX,
        or KML. On iPhone the file is saved to the app&apos;s Files folder
        (visible under <strong>On My iPhone → NOTAM Visualizer</strong>).
      </P>

      <H2>Showing your position</H2>
      <P>
        Tap <strong>My position</strong> in the header to enable the GPS
        layer. The app shows a heading-aware aircraft marker plus a circle for
        the GPS accuracy estimate. Your location stays on the device — it is
        never transmitted anywhere. Tap the same button again to stop
        tracking.
      </P>

      <H2>Reference layers</H2>
      <P>
        The layer panel (top-right of the map) toggles four bundled reference
        sets — Airports, Navaids, VFR waypoints, IFR waypoints — drawn from
        the standard Israeli AIP data. These do not change when NOTAMs
        update; they ship with the app.
      </P>

      <H2>Where the data comes from</H2>
      <P>
        NOTAM data is scraped daily from the public IAA briefing site, parsed
        server-side, and cached. The app fetches the latest cached snapshot
        when you open it. If the daily scrape fails, you may see slightly
        older data — the timestamp on each NOTAM tells you when it was
        issued. The app cannot create or modify NOTAMs; it is a read-only
        viewer.
      </P>

      <H2>Offline use</H2>
      <P>
        The last successful NOTAM fetch is cached, so the app remains usable
        in airplane mode with the most recent snapshot. The map base layer
        (OpenStreetMap tiles) is not pre-cached — areas you have not yet
        visited will appear blank when offline.
      </P>

      <H2>Troubleshooting</H2>
      <ul className="my-3 ms-5 list-disc space-y-1 text-sm text-ink-2">
        <li>
          <strong>No NOTAMs / blank map.</strong> Pull to refresh, or close and
          reopen the app. If the daily scrape failed, the app falls back to
          the last cached snapshot. Check your internet connection.
        </li>
        <li>
          <strong>Position doesn&apos;t appear.</strong> Make sure Location
          permission is granted to NOTAM Visualizer in <em>Settings → Privacy &amp;
          Security → Location Services</em>.
        </li>
        <li>
          <strong>Wrong shape on map.</strong> Some NOTAMs use unusual
          coordinate formats that the parser may not recognise. If you see a
          NOTAM whose footprint looks wrong, please report it (see Contact
          below) with the NOTAM ID.
        </li>
        <li>
          <strong>Export fails on iPhone.</strong> Open the Files app and
          check <strong>On My iPhone → NOTAM Visualizer</strong>. The export saves
          there before opening the share sheet.
        </li>
      </ul>

      <H2>Privacy</H2>
      <P>
        NOTAM Visualizer collects no personal data, has no accounts, and runs no
        analytics or advertising. See the{' '}
        <Link href="/privacy" className="text-nav hover:underline">
          Privacy Notice
        </Link>{' '}
        for details.
      </P>

      <H2>Contact</H2>
      <P>
        For questions, bug reports, or feature requests, email{' '}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-nav hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
        . Please include your app version (shown in the footer below) and the
        NOTAM ID if relevant.
      </P>
    </DocsLayout>
  );
}
