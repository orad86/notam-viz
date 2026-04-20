import * as cheerio from 'cheerio';
import { chromium, type Browser } from 'playwright';

const BASE = 'https://brin.iaa.gov.il/MobileAeroinfo';
const WELCOME_URL = `${BASE}/maiwelcome.aspx`;
const LIST_URL = `${BASE}/maiNotam.aspx`;
const DETAIL_URL = (rowID: string) =>
  `${BASE}/maiDetails.aspx?rowID=${encodeURIComponent(rowID)}&scrpos=0&mode=notam`;

// Chrome 147 on macOS — matches the session Chrome used to mint the cookies
// pasted into IAA_COOKIE_JAR, so the server's fingerprint check passes.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'same-origin',
  'sec-fetch-user': '?1',
};

const CONCURRENCY = 4;
const MIN_JITTER_MS = 200;
const MAX_JITTER_MS = 500;
const DETAIL_MIN_BYTES = 4000;
const LIST_MIN_BYTES = 20000;
const JAR_TTL_MS = 15 * 60 * 1000;
const BROWSER_WARMUP_TIMEOUT_MS = 45_000;

export class WafChallengeError extends Error {
  constructor(url: string) {
    super(`Radware WAF challenge returned for ${url}`);
    this.name = 'WafChallengeError';
  }
}

export interface NotamListEntry {
  rowID: string;
  notamId: string;
  location: string;
}

export interface ScrapeResult {
  rawBlocks: string[];
  fetchedAt: string;
  listed: number;
  failed: Array<{ rowID: string; notamId: string; reason: string }>;
}

type Jar = Map<string, string>;

let cachedJar: { jar: Jar; mintedAt: number } | null = null;
let jarMintLock: Promise<Jar> | null = null;

function parseCookieHeader(raw: string): Jar {
  const jar: Jar = new Map();
  for (const pair of raw.split(/;\s*/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
  return jar;
}

function envJar(): Jar | null {
  const raw = process.env.IAA_COOKIE_JAR;
  if (!raw || raw.trim().length === 0) return null;
  const jar = parseCookieHeader(raw);
  return jar.size > 0 ? jar : null;
}

function isWafChallenge(html: string): boolean {
  return /<title>\s*Error\s*100\s*<\/title>/i.test(html);
}

function parseSetCookie(headers: Headers): string[] {
  const raw =
    (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [];
  if (raw.length > 0) return raw;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function mergeCookies(jar: Jar, setCookies: string[]): void {
  for (const sc of setCookies) {
    const firstPair = sc.split(';', 1)[0];
    const eq = firstPair.indexOf('=');
    if (eq <= 0) continue;
    const name = firstPair.slice(0, eq).trim();
    const value = firstPair.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

function cookieHeader(jar: Jar): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function fetchWithCookies(
  url: string,
  jar: Jar,
  referer?: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  const cookie = cookieHeader(jar);
  if (cookie) headers['Cookie'] = cookie;
  if (referer) headers['Referer'] = referer;

  const res = await fetch(url, { headers, redirect: 'follow' });
  mergeCookies(jar, parseSetCookie(res.headers));
  const body = await res.text();
  return { status: res.status, body };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(): Promise<void> {
  const ms = MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);
  return sleep(ms);
}

async function mintJarWithBrowser(): Promise<Jar> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'en-US',
      timezoneId: 'Asia/Jerusalem',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Hide common automation signals that Radware Bot Manager fingerprints.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // @ts-expect-error non-standard Chrome object
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    page.setDefaultTimeout(BROWSER_WARMUP_TIMEOUT_MS);

    // Navigate through the flow so stormcaster.js runs and the WAF mints
    // a challenge-passed cookie bound to our IP.
    await page.goto(WELCOME_URL, { waitUntil: 'networkidle' });
    await page.goto(LIST_URL, { waitUntil: 'networkidle' });

    // Find one rowID on the list and visit its detail so the WAF sees a
    // detail-page access in a browser context before we replay plain HTTP.
    const rowID = await page.evaluate(() => {
      const el = document.querySelector('tr[onclick^="rowClicked"]');
      if (!el) return null;
      const onclick = el.getAttribute('onclick') ?? '';
      const m = onclick.match(/rowClicked\(\s*['"]?(\d+)['"]?\s*\)/);
      return m ? m[1] : null;
    });

    if (rowID) {
      const url = DETAIL_URL(rowID);
      await page.goto(url, { waitUntil: 'networkidle' });
      // Radware's first response is often the Error 100 challenge page.
      // Give stormcaster.js time to complete its crypto challenge and mint
      // the verification cookie, then reload up to 3 times.
      for (let attempt = 0; attempt < 3; attempt++) {
        const title = await page.title();
        if (!/^\s*Error\s*100/i.test(title)) break;
        await page.waitForTimeout(4000);
        await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
      }
      const finalTitle = await page.title();
      if (/^\s*Error\s*100/i.test(finalTitle)) {
        throw new WafChallengeError(url);
      }
    }

    const jar: Jar = new Map();
    for (const c of await context.cookies()) {
      jar.set(c.name, c.value);
    }
    return jar;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function getJar(forceRefresh: boolean): Promise<Jar> {
  // Env-var path: always takes precedence, never minted via browser.
  const fromEnv = envJar();
  if (fromEnv) return fromEnv;

  if (!forceRefresh && cachedJar && Date.now() - cachedJar.mintedAt < JAR_TTL_MS) {
    return cachedJar.jar;
  }
  if (jarMintLock) return jarMintLock;

  const minting = (async () => {
    const jar = await mintJarWithBrowser();
    cachedJar = { jar, mintedAt: Date.now() };
    return jar;
  })();
  jarMintLock = minting;
  try {
    return await minting;
  } finally {
    if (jarMintLock === minting) jarMintLock = null;
  }
}

function isUsingEnvJar(): boolean {
  return envJar() !== null;
}

function parseList(html: string): NotamListEntry[] {
  const $ = cheerio.load(html);
  const entries: NotamListEntry[] = [];

  $('tr[onclick^="rowClicked"]').each((_, el) => {
    const onclick = $(el).attr('onclick') ?? '';
    const m = onclick.match(/rowClicked\(\s*['"]?(\d+)['"]?\s*\)/);
    if (!m) return;
    const rowID = m[1];

    const notamId = $(el).find('td.DivRecordID').first().text().trim();
    const location = $(el).find('td.DivLocation').first().text().trim();
    if (!rowID || !notamId) return;

    entries.push({ rowID, notamId, location });
  });

  return entries;
}

function parseDetailBlock(html: string): string {
  const $ = cheerio.load(html);
  const lines: string[] = [];
  $('td.DetailsBlueLine b').each((_, el) => {
    const text = $(el).text().replace(/\s+$/g, '');
    if (text.length > 0) lines.push(text);
  });
  return lines.join('\n');
}

async function fetchDetailOnce(
  rowID: string,
  jar: Jar,
): Promise<{ ok: true; block: string } | { ok: false; waf: boolean; reason: string }> {
  const url = DETAIL_URL(rowID);
  const { status, body } = await fetchWithCookies(url, jar, LIST_URL);
  if (status !== 200) {
    return { ok: false, waf: false, reason: `HTTP ${status}` };
  }
  if (isWafChallenge(body) || body.length < DETAIL_MIN_BYTES) {
    return { ok: false, waf: true, reason: 'WAF challenge' };
  }
  const block = parseDetailBlock(body);
  if (!block || block.length < 20) {
    return { ok: false, waf: false, reason: 'Empty detail body' };
  }
  return { ok: true, block };
}

async function fetchList(jar: Jar): Promise<NotamListEntry[]> {
  const res = await fetchWithCookies(LIST_URL, jar, WELCOME_URL);
  if (res.status !== 200) {
    throw new Error(`List page returned HTTP ${res.status}`);
  }
  if (isWafChallenge(res.body) || res.body.length < LIST_MIN_BYTES) {
    throw new WafChallengeError(LIST_URL);
  }
  const entries = parseList(res.body);
  if (entries.length === 0) {
    throw new Error('List page parsed zero NOTAMs');
  }
  return entries;
}

async function runPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<
    { ok: true; value: R } | { ok: false; error: unknown }
  > = new Array(items.length);
  let cursor = 0;

  const runOne = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await jitter();
      try {
        const value = await worker(items[i], i);
        results[i] = { ok: true, value };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runOne),
  );
  return results;
}

export async function scrapeMobileNotams(): Promise<ScrapeResult> {
  let jar = await getJar(false);
  const jarAtStart = jar;

  let entries: NotamListEntry[];
  try {
    entries = await fetchList(jar);
  } catch (error) {
    if (error instanceof WafChallengeError) {
      jar = await getJar(true);
      entries = await fetchList(jar);
    } else {
      throw error;
    }
  }

  let wafRefreshed = jar !== jarAtStart;

  const usingEnv = isUsingEnvJar();

  const worker = async (entry: NotamListEntry): Promise<string> => {
    let first = await fetchDetailOnce(entry.rowID, jar);
    // Non-WAF transient failures (network glitch) — retry once after brief pause.
    if (!first.ok && !first.waf) {
      await sleep(800);
      first = await fetchDetailOnce(entry.rowID, jar);
    }
    if (first.ok) return first.block;
    if (!first.waf) throw new Error(first.reason);

    // Env cookies can't be auto-refreshed; surface a clear message.
    if (usingEnv) {
      throw new Error(
        'WAF challenge with IAA_COOKIE_JAR — cookies likely expired, refresh them from your browser',
      );
    }

    if (!wafRefreshed) {
      wafRefreshed = true;
      jar = await getJar(true);
    }
    const second = await fetchDetailOnce(entry.rowID, jar);
    if (second.ok) return second.block;
    if (second.waf) throw new WafChallengeError(DETAIL_URL(entry.rowID));
    throw new Error(second.reason);
  };

  const outcomes = await runPool(entries, worker, CONCURRENCY);

  const rawBlocks: string[] = [];
  const failed: ScrapeResult['failed'] = [];
  outcomes.forEach((outcome, i) => {
    const entry = entries[i];
    if (outcome.ok) {
      rawBlocks.push(outcome.value);
    } else {
      const reason =
        outcome.error instanceof Error
          ? outcome.error.message
          : String(outcome.error);
      failed.push({ rowID: entry.rowID, notamId: entry.notamId, reason });
    }
  });

  return {
    rawBlocks,
    fetchedAt: new Date().toISOString(),
    listed: entries.length,
    failed,
  };
}
