#!/usr/bin/env node
// Build the static bundle that ships inside the Capacitor iOS shell.
//
// `next export` (output: 'export') does not emit route handlers, so the
// `/api/notams` handler is moved aside for the duration of the build. The
// iOS bundle calls the production Vercel deployment directly via
// NEXT_PUBLIC_API_BASE, which is set before invoking this script.

import { renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(repo, 'src/app/api');
const apiDisabled = resolve(repo, 'src/app/_api_ios_disabled');

if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.error(
    'NEXT_PUBLIC_API_BASE is required for the iOS build.\n' +
    'Example: NEXT_PUBLIC_API_BASE=https://notam-viz.vercel.app npm run ios:build',
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
  run('npx', ['next', 'build'], { IOS_BUILD: '1' });
  run('npm', ['run', 'icons']);
  if (existsSync(resolve(repo, 'ios'))) {
    run('npx', ['cap', 'sync', 'ios']);
  } else {
    console.log('ios/ not scaffolded yet. Run `npx cap add ios` once, then re-run.');
  }
} finally {
  if (moved && existsSync(apiDisabled)) {
    renameSync(apiDisabled, apiDir);
  }
}
