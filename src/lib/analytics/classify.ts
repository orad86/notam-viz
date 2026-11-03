// Classifies a GET /api/notams request by the platform that sent it. Pure: no
// I/O, no state. The user agent is read only to spot automated clients and is
// never stored.
//
// The native shells are identified by Origin alone. Their fetch to the Vercel
// deployment is cross-origin, so the WebView always sends one:
//   iOS     capacitor://localhost   (Capacitor's custom scheme)
//   Android https://localhost       (Capacitor's default androidScheme)
// A browser's same-origin GET sends none. User-agent fallbacks were rejected:
// in-app browsers (Instagram, Gmail, Facebook) share the WKWebView "no Safari
// token" and Android "; wv)" traits, so they would be counted as the apps.

export type Platform = 'ios' | 'android' | 'web' | 'bot';

// Fixed order: it is also the chart colour order (series-1, -2, -3), and
// colour follows the entity, never its rank.
export const PLATFORMS: readonly Platform[] = ['ios', 'android', 'web', 'bot'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  ios: 'iOS app',
  android: 'Android app',
  web: 'Web',
  bot: 'Bot',
};

const BOT_UA =
  /bot|crawl|spider|slurp|curl|wget|python|go-http-client|java\/|axios|node-fetch|undici|headlesschrome|lighthouse|uptime|monitor|facebookexternalhit|whatsapp|preview/i;

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function classifyPlatform(origin: string | null, userAgent: string | null): Platform {
  if (!userAgent || BOT_UA.test(userAgent)) return 'bot';
  if (origin === 'capacitor://localhost') return 'ios';
  if (origin === 'https://localhost' || origin === 'http://localhost') return 'android';
  return 'web';
}

// Vercel's geolocation city arrives URL-encoded ("Tel%20Aviv-Yafo"). Bounded
// and stripped of control characters because it becomes part of a Redis hash
// field name.
export function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  let city = raw;
  try {
    city = decodeURIComponent(raw);
  } catch {
    // Malformed escape: keep the raw value.
  }
  // eslint-disable-next-line no-control-regex
  city = city.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  return city || 'Unknown';
}
