#!/usr/bin/env node
// Build the static bundle that ships inside the Capacitor native shells
// (iOS and Android).
//
// `next export` (output: 'export') does not emit route handlers, so the
// `/api/notams` handler is moved aside for the duration of the build. The
// native bundles call the production Vercel deployment directly via
// NEXT_PUBLIC_API_BASE, which is set before invoking this script.
//
// Restoring it is load-bearing: `_api_native_disabled` is a private folder in
// the App Router, so if it is ever committed, production has no /api/notams
// and every user gets a 404 (shipped in v0.7.4). Nothing inside the try may
// call process.exit() -- it skips `finally` -- so failures throw instead, and
// SIGINT/SIGTERM get a listener so Ctrl-C ends the child build rather than
// killing this process before it can move the folder back.
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

// Check this before doing any work. The Capacitor 8 CLI refuses to run on
// Node < 22, but it only says so at the `cap sync` step -- after the Next
// build and the icon pass have already succeeded, which reads like the build
// worked. It did not: without the sync, the shell keeps whatever web bundle
// it had, and the release build silently ships stale assets.
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(
    `Node ${process.versions.node} is too old. Capacitor 8 requires Node >=22 ` +
    `(see engines.node and .nvmrc).\n` +
    `  nvm use            # if you use nvm\n` +
    `  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # Homebrew node@22`,
  );
  process.exit(1);
}

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
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.signal ?? `exit ${r.status}`})`);
  }
}

// Ctrl-C reaches the child too (same process group): it exits, spawnSync
// returns with `signal` set, and run() throws into the finally below. A
// SIGTERM sent to this process alone lets the current step finish first.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});

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
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  if (moved && existsSync(apiDisabled)) {
    renameSync(apiDisabled, apiDir);
  }
}
