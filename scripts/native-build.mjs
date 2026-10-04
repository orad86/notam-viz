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

// Move src/app/api back if a previous run left it aside. `output: 'export'`
// does not emit route handlers, so this script renames the directory for the
// duration of the build; if that run died without cleaning up, the repo is
// left with no API route at all. That shipped in #59: the leftover rename was
// swept into a `git add -A` and production /api/notams went 404.
function restoreApi() {
  if (existsSync(apiDisabled) && !existsSync(apiDir)) {
    renameSync(apiDisabled, apiDir);
    return true;
  }
  return false;
}

if (restoreApi()) {
  console.warn(
    'Restored src/app/api from a previous interrupted native build. ' +
    'Check `git status` before committing.',
  );
}

// Throws instead of calling process.exit(): process.exit() skips `finally`,
// which is exactly how the rename above used to get stranded.
function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    const err = new Error(`${cmd} ${args.join(' ')} exited with ${r.status ?? 'a signal'}`);
    err.exitCode = r.status ?? 1;
    throw err;
  }
}

// Ctrl-C ends the process without running `finally`, so restore explicitly.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restoreApi();
    process.exit(130);
  });
}

try {
  if (existsSync(apiDir)) {
    renameSync(apiDir, apiDisabled);
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
  console.error(`\nNative build failed: ${err.message}`);
  process.exitCode = err.exitCode ?? 1;
} finally {
  restoreApi();
}
