import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../../src/app');

// scripts/native-build.mjs moves src/app/api to _api_native_disabled for the
// static export. A `_` folder is private in the App Router, so committing it
// in that state removes /api/notams from production. v0.7.4 shipped exactly
// that and every user got "API error: 404".
describe('app route layout', () => {
  it('serves the NOTAM handler from src/app/api', () => {
    expect(
      existsSync(join(APP, 'api/notams/route.ts')),
      'src/app/api/notams/route.ts is missing; a failed native build may have left it renamed',
    ).toBe(true);
  });

  it('has no leftover native-build rename', () => {
    expect(
      existsSync(join(APP, '_api_native_disabled')),
      'move src/app/_api_native_disabled back to src/app/api before committing',
    ).toBe(false);
  });
});
