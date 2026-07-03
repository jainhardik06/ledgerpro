import type { Metadata } from 'next';
import DocsClient from './DocsClient';

export const metadata: Metadata = {
  title: 'Help Center | Money OS',
  description: 'Money OS help center — setup guides, feature walkthroughs, and answers to common questions about your workspace.',
  alternates: { canonical: '/docs' },
  openGraph: { title: 'Help Center | Money OS', description: 'Setup guides, feature walkthroughs, and answers to common questions.', url: '/docs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Help Center | Money OS', description: 'Setup guides, feature walkthroughs, and answers to common questions.' },
};

export default function DocsPage() {
  return <DocsClient />;
}
