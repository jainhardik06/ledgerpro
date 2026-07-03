import type { Metadata } from 'next';
import ChangelogClient from './ChangelogClient';

export const metadata: Metadata = {
  title: 'Changelog | Money OS',
  description: 'What shipped in Money OS — every feature, fix, and improvement, in plain language.',
  alternates: { canonical: '/changelog' },
  openGraph: { title: 'Changelog | Money OS', description: 'What shipped in Money OS — every feature, fix, and improvement.', url: '/changelog', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Changelog | Money OS', description: 'What shipped in Money OS — every feature, fix, and improvement.' },
};

export default function ChangelogPage() {
  return <ChangelogClient />;
}
