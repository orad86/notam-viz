'use client';

import L from 'leaflet';

export type IconType = 'airport' | 'vor' | 'vfr' | 'ifr';

const SVG: Record<IconType, { html: string; size: [number, number] }> = {
  airport: {
    size: [18, 18],
    html: `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
      <line x1="3" y1="9" x2="15" y2="9" stroke="white" stroke-width="2" stroke-linecap="round"/>
      <line x1="9" y1="3" x2="9" y2="15" stroke="white" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  },
  vor: {
    size: [20, 18],
    html: `<svg width="20" height="18" viewBox="0 0 20 18" xmlns="http://www.w3.org/2000/svg">
      <polygon points="5,2 15,2 19,9 15,16 5,16 1,9" fill="#d1fae5" stroke="#065f46" stroke-width="1.5"/>
      <circle cx="10" cy="9" r="1.6" fill="#065f46"/>
    </svg>`,
  },
  vfr: {
    size: [16, 14],
    html: `<svg width="16" height="14" viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,1 15,13 1,13" fill="#8b5cf6" stroke="#4c1d95" stroke-width="1"/>
    </svg>`,
  },
  ifr: {
    size: [16, 14],
    html: `<svg width="16" height="14" viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,1 15,13 1,13" fill="white" stroke="#c2410c" stroke-width="1.5"/>
      <polygon points="8,4 12.5,11.5 3.5,11.5" fill="#f97316"/>
    </svg>`,
  },
};

const iconCache = new Map<IconType, L.DivIcon>();

export function getAviationIcon(type: IconType): L.DivIcon {
  const cached = iconCache.get(type);
  if (cached) return cached;
  const { html, size } = SVG[type];
  const icon = L.divIcon({
    className: 'aviation-icon',
    html,
    iconSize: size,
    iconAnchor: [size[0] / 2, size[1] / 2],
  });
  iconCache.set(type, icon);
  return icon;
}

export function getAviationIconSvg(type: IconType): string {
  return SVG[type].html;
}
