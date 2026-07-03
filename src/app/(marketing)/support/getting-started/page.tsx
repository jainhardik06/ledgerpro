import type { Metadata } from 'next';
import GettingStartedClient from './GettingStartedClient';

export const metadata: Metadata = {
  title: 'Getting Started | Money OS',
  description: 'Get started with Money OS — create your workspace, add your first accounts, and log your first transactions in minutes.',
  alternates: { canonical: '/support/getting-started' },
  openGraph: { title: 'Getting Started | Money OS', description: 'Create your workspace and get running with Money OS in minutes.', url: '/support/getting-started', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Getting Started | Money OS', description: 'Create your workspace and get running with Money OS in minutes.' },
};

export default function GettingStartedPage() {
  return <GettingStartedClient />;
}
