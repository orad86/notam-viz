import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import DocsLayout from '@/components/DocsLayout';
import { renderMarkdown } from '@/lib/render-markdown';

export const metadata: Metadata = {
  title: 'Privacy Notice — NOTAM Visualizer',
  description: 'Privacy Notice for the NOTAM Visualizer app and website.',
};

export default function PrivacyPage() {
  const body = readFileSync(join(process.cwd(), 'PRIVACY.md'), 'utf8');
  return (
    <DocsLayout title="Privacy Notice">{renderMarkdown(body)}</DocsLayout>
  );
}
