export function triggerDownload(
  filename: string,
  mime: string,
  content: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function timestampSuffix(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const HH = String(d.getUTCHours()).padStart(2, '0');
  const MM = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${HH}${MM}Z`;
}

// XML and HTML escaping differ only in how the apostrophe is encoded:
// XML spec allows both `&apos;` and `&#39;`, but `&apos;` is not valid in
// pre-HTML5 and is safer to avoid for PDF/print output. Share the shared
// replacements and swap the last step.
function escape(s: string, apos: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, apos);
}

export function escapeXml(s: string): string {
  return escape(s, '&apos;');
}

export function escapeHtml(s: string): string {
  return escape(s, '&#39;');
}
