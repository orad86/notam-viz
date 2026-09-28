#!/usr/bin/env node
// Build the static bundle that ships inside the Capacitor native shells
// (iOS and Android).
//
// `next export` (output: 'export') does not emit route handlers, so the
// `/api/notams` handler is moved aside for the duration of the build. The
// native bundles call the production Vercel deployment directly via
// NEXT_PUBLIC_API_BASE, which is set before invoking this script.
//
// Usage:
//   node scripts/native-build.mjs          build and sync every scaffolded platform
//   node scripts/native-build.mjs ios      build and sync iOS only
//   node scripts/native-build.mjs android  build and sync Android only

import { renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(repo, 'src/app/api');
const apiDisabled = resolve(repo, 'src/app/_api_native_disabled');

const ALL_PLATFORMS = ['ios', 'android'];

const requested = process.argv[2];
if (requested && !ALL_PLATFORMS.includes(requested)) {
  console.error(
    `Unknown platform "${requested}".\n` +
    `Expected one of: ${ALL_PLATFORMS.join(', ')} (or none, to sync every scaffolded platform).`,
  );
  process.exit(1);
}
const platforms = requested ? [requested] : ALL_PLATFORMS;

if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.error(
    'NEXT_PUBLIC_API_BASE is required for the native build.\n' +
    'Example: NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run ios:build\n' +
    '         NEXT_PUBLIC_API_BASE=https://notam.aero-logic.org npm run android:build',
  );
  process.exit(1);
}

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

let moved = false;
try {
  if (existsSync(apiDir)) {
    renameSync(apiDir, apiDisabled);
    moved = true;
  }
  run('npx', ['next', 'build'], { NATIVE_BUILD: '1' });
  run('npm', ['run', 'icons']);
  for (const platform of platforms) {
    if (existsSync(resolve(repo, platform))) {
      run('npx', ['cap', 'sync', platform]);
    } else {
      console.log(
        `${platform}/ not scaffolded yet. Run \`npx cap add ${platform}\` once, then re-run.`,
      );
    }
  }
} finally {
  if (moved && existsSync(apiDisabled)) {
    renameSync(apiDisabled, apiDir);
  }
}
