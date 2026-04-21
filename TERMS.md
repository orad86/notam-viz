# NOTAM Visualizer — Terms of Use

**Effective Date**: 2026-04-21
**Version**: 1.0

## 1. Acceptance of Terms

By accessing or using NOTAM Visualizer (the "Service"), you agree to these Terms of Use. If you do not agree, do not use the Service.

## 2. Service Description

NOTAM Visualizer is a free, read-only web viewer for Israeli Airports Authority (IAA) Notices to Air Missions. A scheduled task fetches the public IAA mobile AeroInfo feed once a day and renders the result on a map with filtering, a simple route planner, bundled reference layers (airports, navaids, VFR and IFR waypoints), and PDF/GPX/KML export. The Service is provided for **informational and educational purposes only**.

## 3. Critical Safety Notice

### 3.1. Not a Certified Aeronautical Product

**NOTAM Visualizer must not be used for flight operations, pre-flight planning, or in-flight decisions.** It is not a certified aeronautical information product. It exists for ground-based study and visualization only.

### 3.2. Advisory Information, Potentially Stale

All information shown is advisory. Data is refreshed on a daily cadence and may lag official sources by many hours. NOTAM text is parsed heuristically from an unofficial mobile surface of the IAA website; parsing errors, missed records, and misclassified categories are possible.

### 3.3. Verify Through Official Sources

Always verify NOTAMs, airspace status, and any safety-critical information through official sources: the Israeli Airports Authority, the official NOTAM system, certified aeronautical databases, Air Traffic Control, and qualified aviation professionals.

### 3.4. Use at Your Own Risk

Any use of aviation-related information carries inherent risk. You assume full responsibility for decisions you make based on anything shown by the Service.

## 4. No Accounts, No User Data

The Service does not offer user accounts, authentication, or any per-user state. It renders the same public NOTAM snapshot to every visitor. See the Privacy Notice for the limited operational logs that are collected.

## 5. Acceptable Use

You agree not to:

- Use the Service as a primary or sole source of NOTAM information for any actual flight.
- Republish or resell content retrieved from the Service in a way that implies it is official or authoritative.
- Attempt to circumvent the rate limit on the API, scrape at abusive rates, or otherwise degrade the Service for other users.
- Reverse-engineer, probe, or attack the infrastructure that hosts the Service.

## 6. Third-Party Content and Services

The Service depends on third-party components:

- **Israeli Airports Authority (IAA)** — authoritative source of the NOTAM content. NOTAM Visualizer is not affiliated with, endorsed by, or operated by the IAA.
- **OpenStreetMap** — base map tiles, served under the OpenStreetMap attribution visible on the map.
- **Vercel** — application hosting.
- **Upstash (Vercel Marketplace)** — Redis storage for the NOTAM snapshot and the rate-limit counter.

These services have their own terms and the operator of NOTAM Visualizer is not responsible for their conduct.

## 7. Intellectual Property

NOTAM content originates with the IAA and remains subject to whatever rights apply at the source. The NOTAM Visualizer application code, UI, and documentation are the property of the operator.

## 8. Disclaimer of Warranties

**THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE"** without warranties of any kind, express or implied, including warranties of accuracy, completeness, timeliness, fitness for a particular purpose, or uninterrupted operation.

## 9. Limitation of Liability

**TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW**, the operator of NOTAM Visualizer shall not be liable for any direct, indirect, incidental, special, consequential, or exemplary damages arising from your use of or inability to use the Service, including personal injury or death, aircraft damage, navigation errors, airspace incidents, regulatory violations, or any aviation-related accident.

## 10. Indemnification

You agree to indemnify and hold harmless the operator of NOTAM Visualizer from any claims, liabilities, damages, losses, and expenses arising out of your use of the Service or your violation of these Terms.

## 11. Modifications

The operator may modify, suspend, or discontinue the Service at any time without notice. These Terms may be updated; changes take effect when posted, and continued use of the Service after a change constitutes acceptance.

## 12. Governing Law

These Terms are governed by the laws of the State of Israel. Any dispute that cannot be resolved by good-faith negotiation within 30 days shall be brought exclusively in the courts located in Israel.

## 13. Contact

- **Developer**: Orad Eldar
- **Email**: orad@aero-logic.org

---

**CRITICAL SAFETY NOTICE** — NOTAM Visualizer is not a flight-planning product. Never rely on it for operational aviation decisions. Always consult official NOTAM sources.

**© 2026 Orad Eldar. All Rights Reserved.**
