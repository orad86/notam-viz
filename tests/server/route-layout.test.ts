import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '../../src');

// scripts/native-build.mjs parks every server-only path for the static export
// and moves it back afterwards. A `_` folder is private in the App Router, so
// committing the parked state removes the route from production. v0.7.4
// shipped exactly that for /api/notams and every user got "API error: 404".
const SERVER_ONLY = [
  { live: 'app/api/notams/route.ts', parked: 'app/_api_native_disabled' },
  { live: 'app/admin/page.tsx', parked: 'app/_admin_native_disabled' },
  { live: 'middleware.ts', parked: 'middleware.native-disabled.ts' },
];

describe('app route layout', () => {
  it.each(SERVER_ONLY)('serves src/$live', ({ live }) => {
    expect(
      existsSync(join(SRC, live)),
      `src/${live} is missing; a failed native build may have left it parked`,
    ).toBe(true);
  });

  it.each(SERVER_ONLY)('has no leftover native-build park at src/$parked', ({ parked }) => {
    expect(
      existsSync(join(SRC, parked)),
      `move src/${parked} back before committing`,
    ).toBe(false);
  });
});
