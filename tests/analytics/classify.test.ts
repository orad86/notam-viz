import { describe, it, expect } from 'vitest';
import { classifyPlatform, normalizeCity } from '@/lib/analytics/classify';

const UA = {
  iosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.32.109',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  curl: 'curl/8.7.1',
};

describe('classifyPlatform', () => {
  it('identifies the iOS shell by its capacitor:// origin', () => {
    expect(classifyPlatform('capacitor://localhost', UA.iosWebView)).toBe('ios');
  });

  it('identifies the Android shell by its https://localhost origin', () => {
    expect(classifyPlatform('https://localhost', UA.androidWebView)).toBe('android');
  });

  it.each([
    ['iPhone Safari', UA.iphoneSafari],
    ['Android Chrome', UA.androidChrome],
    ['desktop Chrome', UA.desktopChrome],
  ])('counts %s with no Origin (same-origin GET) as web', (_name, ua) => {
    expect(classifyPlatform(null, ua)).toBe('web');
  });

  // In-app browsers share the WebView UA traits; only Origin tells them apart.
  it.each([
    ['Instagram in-app browser (iOS)', UA.instagramIos],
    ['an Android WebView in another app', UA.androidWebView],
    ['a bare iOS WebView', UA.iosWebView],
  ])('does not count %s as the app without the shell origin', (_name, ua) => {
    expect(classifyPlatform(null, ua)).toBe('web');
    expect(classifyPlatform('https://notam.aero-logic.org', ua)).toBe('web');
  });

  it.each([
    ['Googlebot', UA.googlebot],
    ['curl', UA.curl],
    ['an empty UA', ''],
  ])('counts %s as a bot', (_name, ua) => {
    expect(classifyPlatform(null, ua)).toBe('bot');
  });

  it('classifies a bot UA as bot even with an app origin', () => {
    expect(classifyPlatform('capacitor://localhost', UA.curl)).toBe('bot');
  });

  it('treats a missing UA as a bot', () => {
    expect(classifyPlatform('capacitor://localhost', null)).toBe('bot');
  });
});

describe('normalizeCity', () => {
  it('decodes Vercel’s URL-encoded city', () => {
    expect(normalizeCity('Tel%20Aviv-Yafo')).toBe('Tel Aviv-Yafo');
  });

  it('falls back to Unknown for missing or blank values', () => {
    expect(normalizeCity(undefined)).toBe('Unknown');
    expect(normalizeCity('   ')).toBe('Unknown');
  });

  it('keeps a malformed escape as-is rather than throwing', () => {
    expect(normalizeCity('Haifa%')).toBe('Haifa%');
  });

  it('strips control characters and bounds the length', () => {
    expect(normalizeCity('Eilat\n\u0000')).toBe('Eilat');
    expect(normalizeCity('x'.repeat(200))).toHaveLength(60);
  });
});
