import type { Metadata } from 'next';
import GuidesClient from './GuidesClient';

export const metadata: Metadata = {
  title: 'Guides & Tutorials | Money OS',
  description: 'Step-by-step guides and tutorials for getting the most out of Money OS — from workspace setup to advanced reporting.',
  alternates: { canonical: '/guides' },
  openGraph: { title: 'Guides & Tutorials | Money OS', description: 'Step-by-step guides for getting the most out of Money OS.', url: '/guides', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Guides & Tutorials | Money OS', description: 'Step-by-step guides for getting the most out of Money OS.' },
};

export default function GuidesPage() {
  return <GuidesClient />;
}
