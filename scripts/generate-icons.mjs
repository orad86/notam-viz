#!/usr/bin/env node
// Rasterise public/icons/source/notam-icon.svg into the PNG set the PWA
// manifest and the Capacitor iOS asset catalog expect. Kept as an on-demand
// script (run via `npm run icons`) so `sharp` stays a dev-only, opt-in dep.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const source = resolve(repo, 'public/icons/source/notam-icon.svg');

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

// PWA / web targets.
const pwaTargets = [
  { size: 180, out: 'public/icons/icon-180.png', alpha: true },
  { size: 192, out: 'public/icons/icon-192.png', alpha: true },
  { size: 512, out: 'public/icons/icon-512.png', alpha: true },
  { size: 1024, out: 'public/icons/icon-1024.png', alpha: false },
];

// Modern Xcode uses a unified 1024x1024 AppIcon (scaled automatically by the
// OS). The file is named AppIcon-512@2x.png to match the Capacitor-scaffolded
// Contents.json. No alpha (Apple rejects transparent app icons).
const iosTargets = [
  {
    size: 1024,
    out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    alpha: false,
  },
];

async function render({ size, out, alpha = true }) {
  const absolute = resolve(repo, out);
  await mkdir(dirname(absolute), { recursive: true });
  let pipeline = sharp(svg, { density: 384 }).resize(size, size);
  if (!alpha) {
    pipeline = pipeline.flatten({ background: '#0f172a' });
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(absolute);
  console.log(`  ${size.toString().padStart(4, ' ')}px  ${out}`);
}

console.log('PWA icons:');
for (const t of pwaTargets) await render(t);

const iosRoot = resolve(repo, 'ios/App');
if (existsSync(iosRoot)) {
  console.log('iOS AppIcon.appiconset:');
  for (const t of iosTargets) await render(t);
} else {
  console.log('ios/ not scaffolded yet — skipping AppIcon.appiconset.');
  console.log('Run `npx cap add ios` first, then re-run `npm run icons`.');
}
