import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isListPageValid, isDetailPageValid } from './scraper-mobile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '../../tests/fixtures/iaa');

// The fixture is already padded to exceed LIST_MIN_CHARS (20000). Real IAA
// pages are 150 KB+ due to ASP.NET viewstate; our fixture only keeps the
// DOM shape the validator depends on.
const listOk = readFileSync(join(FIX, 'list-ok.html'), 'utf8');

// A Radware challenge page — deliberately small and Error-100 titled.
const WAF_CHALLENGE = `<!DOCTYPE html><html><head><title>Error 100</title></head><body>Please wait…</body></html>`;

// A real detail page shape — has the marker class and bold ICAO lines.
const DETAIL_OK = `<html><body>${'<p>padding</p>'.repeat(
  400,
)}<table><tr><td class="DetailsBlueLine"><b>A0001/26 NOTAMN</b></td></tr><tr><td class="DetailsBlueLine"><b>Q) LLLL/QFALC/IV/NBO/A/000/999/3200N03450E005</b></td></tr></table></body></html>`;

describe('isListPageValid', () => {
  it('accepts a real list page with rowClicked rows', () => {
    expect(isListPageValid(listOk)).toBe(true);
  });

  it('rejects the Radware Error 100 challenge page', () => {
    expect(isListPageValid(WAF_CHALLENGE)).toBe(false);
  });

  it('rejects pages below the minimum byte threshold', () => {
    const tiny = `<html>tr onclick="rowClicked(1)"</html>`;
    expect(isListPageValid(tiny)).toBe(false);
  });

  it('rejects a large page that lacks rowClicked rows (positive-signal)', () => {
    const filler = 'x'.repeat(30000);
    expect(isListPageValid(filler)).toBe(false);
  });
});

describe('isDetailPageValid', () => {
  it('accepts a detail page carrying DetailsBlueLine + <b> spans', () => {
    expect(isDetailPageValid(DETAIL_OK)).toBe(true);
  });

  it('rejects the Radware Error 100 challenge page', () => {
    expect(isDetailPageValid(WAF_CHALLENGE)).toBe(false);
  });

  it('rejects a large page that lacks the DetailsBlueLine positive marker', () => {
    const filler = 'y'.repeat(10000);
    expect(isDetailPageValid(filler)).toBe(false);
  });
});
