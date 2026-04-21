import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import HomePage from '@/components/HomePage';

export default function Page() {
  const termsMd = readFileSync(join(process.cwd(), 'TERMS.md'), 'utf8');
  const privacyMd = readFileSync(join(process.cwd(), 'PRIVACY.md'), 'utf8');
  return <HomePage termsMd={termsMd} privacyMd={privacyMd} />;
}
