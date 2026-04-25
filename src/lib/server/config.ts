// Single source of truth for upstream URLs, KV keys, and cache windows.
// Import from here; do not duplicate these literals across route handlers,
// scripts, or the scraper.

export const IAA_BASE = 'https://brin.iaa.gov.il/MobileAeroinfo';
export const IAA_LIST_URL = `${IAA_BASE}/maiNotam.aspx`;
export const IAA_WELCOME_URL = `${IAA_BASE}/maiwelcome.aspx`;

export function iaaDetailUrl(rowID: string): string {
  return `${IAA_BASE}/maiDetails.aspx?rowID=${encodeURIComponent(rowID)}&scrpos=0&mode=notam`;
}

// Key used for the single NOTAM snapshot written daily by the scraper.
export const KV_LATEST_KEY = 'notams:latest';

// CDN caching window for /api/notams. Aligns with the daily scrape cadence:
// one hour hot cache, 24 hours stale-while-revalidate as a graceful-degradation
// cushion if the scrape is late or KV is briefly unreachable.
export const CACHE_MAX_AGE_SECONDS = 3600;
export const CACHE_STALE_SECONDS = 86400;
