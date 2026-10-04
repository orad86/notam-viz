import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// scripts/native-build.mjs renames src/app/api aside while it builds the
// static export, because `output: 'export'` cannot emit route handlers. If a
// run dies without restoring it, the repo is left with no API route. That was
// committed in #59 and production /api/notams returned 404, with every other
// check green: lint and typecheck never reference the route, and Vercel builds
// a site with no API happily.
//
// These assert the state the repository must be in at rest.

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../../src/app');

describe('API route at rest', () => {
  it('has the /api/notams route handler in place', () => {
    expect(existsSync(join(APP, 'api/notams/route.ts'))).toBe(true);
  });

  it('has no leftover directory from an interrupted native build', () => {
    expect(existsSync(join(APP, '_api_native_disabled'))).toBe(false);
  });

  it('still exports the handlers the clients rely on', () => {
    const src = readFileSync(join(APP, 'api/notams/route.ts'), 'utf8');
    expect(src).toMatch(/export (async )?function GET/);
    expect(src).toMatch(/export (async )?function OPTIONS/);
  });
});
