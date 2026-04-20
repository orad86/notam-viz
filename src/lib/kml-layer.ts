export type KmlPoint = { name: string; lat: number; lon: number };

export function parseKmlPoints(xml: string): KmlPoint[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return [];
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  return placemarks.flatMap((p) => {
    const name = p.getElementsByTagName('name')[0]?.textContent?.trim() ?? '';
    const coords = p.getElementsByTagName('coordinates')[0]?.textContent?.trim();
    if (!coords) return [];
    const [lonStr, latStr] = coords.split(',');
    const lon = Number(lonStr);
    const lat = Number(latStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ name, lat, lon }];
  });
}

const cache = new Map<string, Promise<KmlPoint[]>>();

export function loadKmlPoints(url: string): Promise<KmlPoint[]> {
  const cached = cache.get(url);
  if (cached) return cached;
  const promise = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`KML fetch failed: ${r.status}`);
      return r.text();
    })
    .then(parseKmlPoints)
    .catch((err) => {
      console.error(`Failed to load KML ${url}:`, err);
      cache.delete(url);
      return [] as KmlPoint[];
    });
  cache.set(url, promise);
  return promise;
}
