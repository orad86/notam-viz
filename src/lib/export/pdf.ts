import { ParsedNotam } from '@/types/notam';
import {
  formatUtcDate,
  formatAltitudeRange,
  formatScope,
  formatTraffic,
  getCategoryColor,
} from '@/lib/notam-format';
import { escapeHtml } from './download';

function eItemText(n: ParsedNotam): string {
  return (n.eItem || '').replace(/^E\)\s*/, '').replace(/E\)\s*/g, '').trim();
}

function geometryCell(n: ParsedNotam): string {
  const g = n.geometry;
  if (!g) return '—';
  if (g.type === 'point') {
    return `Point · ${g.lat.toFixed(3)}°, ${g.lon.toFixed(3)}°`;
  }
  if (g.type === 'circle') {
    return `Circle · ${g.lat.toFixed(3)}°, ${g.lon.toFixed(3)}° · R=${g.radiusNm} NM`;
  }
  if (g.type === 'polygon') {
    return `Polygon · ${g.vertices.length} vertices`;
  }
  if (g.type === 'multipoint') {
    return `Multipoint · ${g.points.length} points`;
  }
  return '—';
}

function row(label: string, value: string): string {
  return `
    <div class="row">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
    </div>`;
}

function buildCard(n: ParsedNotam, idx: number, total: number): string {
  const color = getCategoryColor(n.category);
  const validFrom = formatUtcDate(n.effective);
  const validTo = n.expires === 'PERM' ? 'PERMANENT' : formatUtcDate(n.expires);
  const scope = formatScope(n.scope) || '—';
  const traffic = formatTraffic(n.significance) || '—';
  const altitude = formatAltitudeRange(n) || '—';
  const qCode = n.qCodeExplanation
    ? `${n.qCode} — ${n.qCodeExplanation}`
    : n.qCode;

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

    <div class="meta">
      ${row('FIR', n.fir)}
      ${row('Location', n.location || '—')}
      ${row('Scope', scope)}
      ${row('Traffic', traffic)}
      ${row('Altitude', altitude)}
      ${row('Geometry', geometryCell(n))}
      <div class="row span2">
        <div class="label">Q-code</div>
        <div class="value">${escapeHtml(qCode)}</div>
      </div>
      ${n.dLine ? `<div class="row span2"><div class="label">Schedule</div><div class="value">${escapeHtml(n.dLine)}</div></div>` : ''}
    </div>

    <div class="eitem">
      <div class="label">E-Item</div>
      <pre>${escapeHtml(eItemText(n))}</pre>
    </div>
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
    line-height: 1.4;
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

  .noprint {
    margin: 8px 0 14px;
    padding: 10px 12px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    font-size: 10pt;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .noprint button {
    padding: 6px 14px;
    font-size: 10pt;
    background: #1d4ed8;
    color: #fff;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
  }
  @media print { .noprint { display: none; } }

  .card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
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
    border-bottom: 1px dashed #e5e7eb;
    padding-bottom: 6px;
    margin-bottom: 8px;
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
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px 16px;
    margin-bottom: 8px;
  }
  .row { display: flex; gap: 6px; font-size: 9.5pt; }
  .row.span2 { grid-column: 1 / -1; }
  .label {
    color: #6b7280;
    font-weight: 600;
    min-width: 60px;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .value { color: #111827; word-break: break-word; }

  .eitem {
    border-top: 1px dashed #e5e7eb;
    padding-top: 6px;
  }
  .eitem .label {
    display: block;
    margin-bottom: 3px;
  }
  .eitem pre {
    margin: 0;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 9pt;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1f2937;
    background: #f9fafb;
    padding: 6px 8px;
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

<div class="noprint">
  <span>Use your browser's print dialog to save as PDF.</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

${cards}

<footer class="doc-footer">Generated by NOTAM Visualizer</footer>

<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 250);
  });
</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked — please allow pop-ups for this site to export as PDF.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
