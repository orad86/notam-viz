import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import DocsLayout from '@/components/DocsLayout';
import { renderMarkdown } from '@/lib/render-markdown';

export const metadata: Metadata = {
  title: 'Terms of Use — NOTAM Visualizer',
  description: 'Terms of Use for the NOTAM Visualizer app and website.',
};

export default function TermsPage() {
  const body = readFileSync(join(process.cwd(), 'TERMS.md'), 'utf8');
  return <DocsLayout title="Terms of Use">{renderMarkdown(body)}</DocsLayout>;
}
