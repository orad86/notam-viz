// Deliver a generated file to the user.
//
// Native (Capacitor, iOS and Android): write to the Documents directory via
// @capacitor/filesystem, then offer the native share sheet pointing at the
// saved file.
//   - iOS: the file is visible in the Files app under
//     "On My iPhone → NOTAM Visualizer" once UIFileSharingEnabled +
//     LSSupportsOpeningDocumentsInPlace are set in Info.plist.
//   - Android: it lands in the public Documents folder, which needs no
//     storage permission from API 30 up (the shell's minSdk), and reaches the
//     share sheet as a FileProvider content URI. The Documents root has to be
//     declared in res/xml/file_paths.xml or Share.share throws.
//
// Desktop: standard <a download> click.
export async function triggerDownload(
  filename: string,
  mime: string,
  content: string,
): Promise<void> {
  if (isCapacitorNative()) {
    await saveOnDevice(filename, mime, content);
    return;
  }

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

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
}

async function saveOnDevice(
  filename: string,
  mime: string,
  content: string,
): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');

  const written = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  try {
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: 'Save or share NOTAM export',
    });
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return;
    // Share unavailable — the file is already saved; nothing else to do.
  }

  // Keep mime in the signature so the caller can stay format-agnostic even
  // though Filesystem infers type from the extension. Reference to silence
  // the unused-param lint without changing the API.
  void mime;
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
