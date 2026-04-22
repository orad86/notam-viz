import { ParsedNotam } from '@/types/notam';
import {
  formatUtcDate,
  formatAltitudeRange,
  getCategoryColor,
} from '@/lib/notam-format';
import { escapeHtml, triggerDownload, timestampSuffix } from './download';

function eItemText(n: ParsedNotam): string {
  return (n.eItem || '').replace(/^E\)\s*/, '').replace(/E\)\s*/g, '').trim();
}

function buildCard(n: ParsedNotam, idx: number, total: number): string {
  const color = getCategoryColor(n.category);
  const validFrom = formatUtcDate(n.effective);
  const validTo = n.expires === 'PERM' ? 'PERMANENT' : formatUtcDate(n.expires);
  const altitude = formatAltitudeRange(n);
  const location = n.location?.trim();
  const schedule = n.dLine?.trim();

  const metaItems: string[] = [];
  if (location) metaItems.push(`<span><b>LOC</b> ${escapeHtml(location)}</span>`);
  if (altitude) metaItems.push(`<span><b>ALT</b> ${escapeHtml(altitude)}</span>`);
  if (schedule) metaItems.push(`<span><b>SCHED</b> ${escapeHtml(schedule)}</span>`);
  const metaLine = metaItems.length
    ? `<div class="meta">${metaItems.join(' <em class="sep">·</em> ')}</div>`
    : '';

  return `
  <article class="card">
    <header>
      <div class="title">
        <span class="seq">${idx + 1}/${total}</span>
        <span class="id">${escapeHtml(n.notamId)}</span>
        <span class="chip" style="background:${color}">${escapeHtml(n.category)}</span>
        ${n.isActive ? '<span class="chip-active">ACTIVE</span>' : ''}
      </div>
      <div class="validity">
        <span class="from">${escapeHtml(validFrom)}</span>
        <span class="arrow">→</span>
        <span class="to ${n.expires === 'PERM' ? 'perm' : ''}">${escapeHtml(validTo)}</span>
      </div>
    </header>

    ${metaLine}

    <pre class="eitem">${escapeHtml(eItemText(n))}</pre>
  </article>`;
}

export function exportPdf(notams: ParsedNotam[]): void {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const cards = notams.map((n, i) => buildCard(n, i, notams.length)).join('');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NOTAM Export — ${notams.length} items</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: #111827;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  .page-header h1 { font-size: 16pt; margin: 0; color: #1e3a8a; }
  .page-header .meta { font-size: 9pt; color: #6b7280; }

  .card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
    break-inside: avoid;
    background: #fff;
  }

  .card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .seq {
    font-size: 8pt;
    color: #9ca3af;
    font-variant-numeric: tabular-nums;
  }
  .id {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 12pt;
    font-weight: 700;
    color: #111827;
  }
  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    color: #fff;
    font-size: 8.5pt;
    text-transform: capitalize;
    font-weight: 600;
  }
  .chip-active {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    background: #dcfce7;
    color: #166534;
    font-size: 8.5pt;
    font-weight: 700;
  }
  .validity {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 9pt;
    white-space: nowrap;
  }
  .validity .from { color: #374151; }
  .validity .arrow { color: #9ca3af; margin: 0 4px; }
  .validity .to { color: #374151; }
  .validity .to.perm { color: #b91c1c; font-weight: 700; }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 4px 0;
    font-size: 9pt;
    color: #374151;
  }
  .meta b {
    color: #6b7280;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-right: 4px;
  }
  .meta .sep { color: #d1d5db; font-style: normal; }

  .eitem {
    margin: 6px 0 0;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 9.5pt;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1f2937;
    background: #f9fafb;
    padding: 8px 10px;
    border-radius: 4px;
    border-left: 3px solid #1d4ed8;
  }

  footer.doc-footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #e5e7eb;
    font-size: 8pt;
    color: #6b7280;
    text-align: center;
  }
</style>
</head>
<body>

<div class="page-header">
  <h1>NOTAM Export</h1>
  <div class="meta">${notams.length} NOTAM${notams.length === 1 ? '' : 's'} &middot; Generated ${escapeHtml(now)}</div>
</div>

${cards}

<footer class="doc-footer">Generated by NOTAM Visualizer</footer>

</body>
</html>`;

  // On the iOS Capacitor shell, save the HTML file to the app's Documents
  // directory (visible in the Files app) and offer the share sheet. WebKit
  // in Capacitor does not surface a usable print dialog, so rendering a PDF
  // would require a native plugin; the HTML is fully self-contained and can
  // be re-opened in Safari/Files to print to PDF.
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    void triggerDownload(`notams-${timestampSuffix()}.html`, 'text/html', html);
    return;
  }

  // Desktop browsers: render into a hidden iframe and trigger its own print
  // dialog. Works reliably without opening a new tab (no popup block).
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    const onAfter = () => {
      win.removeEventListener('afterprint', onAfter);
      cleanup();
    };
    win.addEventListener('afterprint', onAfter);
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    }, 100);
  };

  iframe.srcdoc = html;
}
