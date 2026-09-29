#!/usr/bin/env node
// Build the Google Play store listing assets into play-assets/ (gitignored).
//
// Play rejects anything with an alpha channel and caps screenshots at a 2:1
// aspect ratio, so device captures from a tall phone (Pixel 7 is 1080x2400,
// i.e. 2.22:1) fail as-is. Capture at 1080x1920 instead:
//
//   adb shell wm size 1080x1920 && adb shell wm density 420
//   adb exec-out screencap -p > play-assets/screenshots/src/01-map.png
//   adb shell wm size reset && adb shell wm density reset
//
// Then run `npm run play:assets`. Anything in screenshots/src/ is flattened
// and validated; the feature graphic is generated from the app icon.

import { readFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const out = resolve(repo, 'play-assets');
const shotsIn = resolve(out, 'screenshots/src');
const shotsOut = resolve(out, 'screenshots');

const PAPER = '#f5f1e7';
const PLATE = '#0f172a';
const INK = '#1a2b47';
const ACCENT = '#c2410c';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is not installed. Run: npm i -D sharp');
  process.exit(1);
}

await mkdir(shotsOut, { recursive: true });
await mkdir(shotsIn, { recursive: true });

// --- Feature graphic (1024x500, required by Play) ----------------------------
// Play crops and overlays this in some placements, so the wordmark stays well
// inside the middle and nothing load-bearing touches an edge.

const iconSvg = await readFile(resolve(repo, 'public/icons/source/notam-icon.svg'));
const iconPlate = await sharp(iconSvg, { density: 384 })
  .resize(300, 300)
  .png()
  .toBuffer();

// Rounded-corner mask for the icon tile.
const tileMask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">` +
  `<rect width="300" height="300" rx="66" ry="66" fill="#fff"/></svg>`,
);
const iconTile = await sharp(iconPlate)
  .composite([{ input: tileMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const featureBg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
     <rect width="1024" height="500" fill="${PAPER}"/>
     <!-- Faint sectional-style rings bleeding off the right edge. -->
     <g fill="none" stroke="${INK}" stroke-width="2" opacity="0.10">
       <circle cx="980" cy="250" r="150"/>
       <circle cx="980" cy="250" r="230"/>
       <circle cx="980" cy="250" r="310"/>
       <circle cx="980" cy="250" r="390"/>
     </g>
     <g fill="none" stroke="${ACCENT}" stroke-width="3" opacity="0.30">
       <circle cx="742" cy="196" r="54"/>
       <circle cx="828" cy="330" r="38"/>
     </g>
     <rect x="0" y="0" width="14" height="500" fill="${ACCENT}" opacity="0.85"/>
     <text x="388" y="228"
           font-family="Georgia, 'Times New Roman', serif"
           font-size="56" font-weight="700" fill="${INK}">NOTAM Visualizer</text>
     <text x="391" y="284"
           font-family="Helvetica, Arial, sans-serif"
           font-size="25" fill="${INK}" opacity="0.72">Israeli NOTAMs on an interactive map</text>
     <text x="391" y="326"
           font-family="Helvetica, Arial, sans-serif"
           font-size="25" fill="${INK}" opacity="0.72">Filter by route, altitude and time</text>
   </svg>`,
);

await sharp(featureBg)
  .composite([{ input: iconTile, top: 100, left: 68 }])
  .flatten({ background: PAPER })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, 'feature-graphic-1024x500.png'));
console.log('  1024x500  play-assets/feature-graphic-1024x500.png');

// --- App icon (512x512, no alpha) -------------------------------------------
await sharp(iconSvg, { density: 384 })
  .resize(512, 512)
  .flatten({ background: PLATE })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, 'app-icon-512.png'));
console.log('   512x512  play-assets/app-icon-512.png');

// --- Screenshots -------------------------------------------------------------
const files = existsSync(shotsIn)
  ? (await readdir(shotsIn)).filter((f) => /\.(png|jpg|jpeg)$/i.test(f)).sort()
  : [];

if (files.length === 0) {
  console.log('\nNo screenshots in play-assets/screenshots/src/ — see the header of this file.');
} else {
  console.log('Screenshots:');
  for (const file of files) {
    const src = resolve(shotsIn, file);
    const meta = await sharp(src).metadata();
    const long = Math.max(meta.width, meta.height);
    const short = Math.min(meta.width, meta.height);

    // Play: 320-3840px per side, and the long side at most twice the short.
    const problems = [];
    if (short < 320 || long > 3840) problems.push(`${meta.width}x${meta.height} outside 320-3840`);
    if (long > short * 2) problems.push(`aspect ${(long / short).toFixed(2)}:1 exceeds 2:1`);

    const name = basename(file).replace(/\.(png|jpg|jpeg)$/i, '.png');
    const dest = resolve(shotsOut, name);
    await sharp(src).flatten({ background: PAPER }).removeAlpha()
      .png({ compressionLevel: 9 }).toFile(dest);

    const verdict = problems.length ? `REJECTED BY PLAY: ${problems.join('; ')}` : 'ok';
    console.log(`  ${meta.width}x${meta.height}  play-assets/screenshots/${name}  ${verdict}`);
  }
}

if (files.length > 0 && files.length < 2) {
  console.log('\nPlay requires at least 2 phone screenshots.');
}
