#!/usr/bin/env node
// Rasterise public/icons/source/notam-icon.svg into the PNG set the PWA
// manifest, the Capacitor iOS asset catalog, and the Capacitor Android
// mipmap/drawable set expect. Kept as an on-demand script (run via
// `npm run icons`) so `sharp` stays a dev-only, opt-in dep.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const source = resolve(repo, 'public/icons/source/notam-icon.svg');

// The navy plate the artwork sits on. Also the Android adaptive-icon
// background colour (res/values/ic_launcher_background.xml) and the fill
// Apple's no-alpha rule forces onto the iOS AppIcon.
const PLATE = '#0f172a';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error(
    'sharp is not installed.\n' +
    'Install it as a dev dependency to generate icons:\n' +
    '  npm i -D sharp',
  );
  process.exit(1);
}

if (!existsSync(source)) {
  console.error(`Source not found: ${source}`);
  process.exit(1);
}

const svg = await readFile(source);

// Android adaptive icons composite a foreground layer over a separate
// background layer, and the launcher masks and parallax-shifts them. Only the
// centre 72/108 of the canvas is guaranteed visible, so the foreground is the
// artwork *without* its navy plate, scaled into that safe zone. Strip the
// plate from the markup in memory; the source SVG on disk is untouched.
const foregroundSvg = Buffer.from(
  svg.toString('utf8').replace(/\s*<rect width="1024" height="1024"[^/]*\/>/, ''),
);

const ADAPTIVE_SAFE_ZONE = 72 / 108;

// PWA / web targets.
const pwaTargets = [
  { size: 180, out: 'public/icons/icon-180.png' },
  { size: 192, out: 'public/icons/icon-192.png' },
  { size: 512, out: 'public/icons/icon-512.png' },
  { size: 1024, out: 'public/icons/icon-1024.png', background: PLATE },
  // Android launchers and the Play listing both mask icons. A maskable icon
  // keeps the artwork inside the safe zone over a filled plate so the mask
  // never clips the caution triangle.
  {
    size: 512,
    out: 'public/icons/icon-maskable-512.png',
    background: PLATE,
    inset: ADAPTIVE_SAFE_ZONE,
  },
  // Play Console's app icon field wants a 512x512 32-bit PNG; alpha is
  // accepted but flattened anyway, so hand it a flat one.
  { size: 512, out: 'public/icons/play-icon-512.png', background: PLATE },
];

// Modern Xcode uses a unified 1024x1024 AppIcon (scaled automatically by the
// OS). The file is named AppIcon-512@2x.png to match the Capacitor-scaffolded
// Contents.json. No alpha (Apple rejects transparent app icons).
const iosTargets = [
  {
    size: 1024,
    out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    background: PLATE,
  },
];

// Android density buckets. `launcher` is the legacy square/round icon used
// below API 26; `adaptive` is the API 26+ foreground layer, which is 108dp
// against the launcher's 48dp.
const androidDensities = [
  { dir: 'mdpi', launcher: 48, adaptive: 108 },
  { dir: 'hdpi', launcher: 72, adaptive: 162 },
  { dir: 'xhdpi', launcher: 96, adaptive: 216 },
  { dir: 'xxhdpi', launcher: 144, adaptive: 324 },
  { dir: 'xxxhdpi', launcher: 192, adaptive: 432 },
];

const androidTargets = [
  ...androidDensities.flatMap(({ dir, launcher, adaptive }) => [
    {
      size: launcher,
      out: `android/app/src/main/res/mipmap-${dir}/ic_launcher.png`,
      background: PLATE,
    },
    {
      size: launcher,
      out: `android/app/src/main/res/mipmap-${dir}/ic_launcher_round.png`,
      background: PLATE,
      round: true,
    },
    {
      size: adaptive,
      out: `android/app/src/main/res/mipmap-${dir}/ic_launcher_foreground.png`,
      svg: foregroundSvg,
      inset: ADAPTIVE_SAFE_ZONE,
    },
  ]),
  // The Android 12+ splash screen draws this centred on
  // windowSplashScreenBackground. It is masked to a circle by the system, so
  // it gets the same safe-zone inset as the adaptive foreground.
  {
    size: 288,
    out: 'android/app/src/main/res/drawable/splash_icon.png',
    svg: foregroundSvg,
    inset: ADAPTIVE_SAFE_ZONE,
  },
];

async function render({ size, out, background, svg: markup = svg, inset, round }) {
  const absolute = resolve(repo, out);
  await mkdir(dirname(absolute), { recursive: true });

  // `inset` shrinks the artwork and pads it back out to `size`, so the
  // drawing lands inside the mask's safe zone instead of touching the edges.
  const inner = inset ? Math.round(size * inset) : size;
  const pad = Math.floor((size - inner) / 2);

  let pipeline = sharp(markup, { density: 384 }).resize(inner, inner);

  if (pad > 0) {
    pipeline = pipeline.extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  if (background) {
    pipeline = pipeline.flatten({ background });
  }

  if (round) {
    // Legacy round launcher icon: punch a circle out of the square render.
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    pipeline = sharp(await pipeline.png().toBuffer()).composite([
      { input: mask, blend: 'dest-in' },
    ]);
  }

  await pipeline.png({ compressionLevel: 9 }).toFile(absolute);
  console.log(`  ${size.toString().padStart(4, ' ')}px  ${out}`);
}

console.log('PWA icons:');
for (const t of pwaTargets) await render(t);

if (existsSync(resolve(repo, 'ios/App'))) {
  console.log('iOS AppIcon.appiconset:');
  for (const t of iosTargets) await render(t);
} else {
  console.log('ios/ not scaffolded yet — skipping AppIcon.appiconset.');
  console.log('Run `npx cap add ios` first, then re-run `npm run icons`.');
}

if (existsSync(resolve(repo, 'android/app'))) {
  console.log('Android mipmaps and splash icon:');
  for (const t of androidTargets) await render(t);
} else {
  console.log('android/ not scaffolded yet — skipping mipmaps.');
  console.log('Run `npx cap add android` first, then re-run `npm run icons`.');
}

// Flat splash background for the pre-Android-12 fallback. Capacitor ships its
// own logo there; overwrite it so a cold start never flashes the default.
if (existsSync(resolve(repo, 'android/app'))) {
  const splashDirs = [
    'drawable',
    'drawable-land-mdpi', 'drawable-land-hdpi', 'drawable-land-xhdpi',
    'drawable-land-xxhdpi', 'drawable-land-xxxhdpi',
    'drawable-port-mdpi', 'drawable-port-hdpi', 'drawable-port-xhdpi',
    'drawable-port-xxhdpi', 'drawable-port-xxxhdpi',
  ];
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">` +
    `<rect width="1" height="1" fill="#f5f1e7"/></svg>`,
  );
  console.log('Android splash plate (--paper):');
  for (const dir of splashDirs) {
    const out = `android/app/src/main/res/${dir}/splash.png`;
    const absolute = resolve(repo, out);
    if (!existsSync(dirname(absolute))) continue;
    await sharp(plate, { density: 384 })
      .resize(64, 64)
      .png({ compressionLevel: 9 })
      .toFile(absolute);
    console.log(`    64px  ${out}`);
  }
}
