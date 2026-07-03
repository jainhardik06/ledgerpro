import type { Metadata } from 'next';
import SupportClient from './SupportClient';

export const metadata: Metadata = {
  title: 'Support | Money OS',
  description: 'Money OS support center — search help articles, browse guides, or contact the team directly.',
  alternates: { canonical: '/support' },
  openGraph: { title: 'Support | Money OS', description: 'Search help articles, browse guides, or contact the Money OS team.', url: '/support', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Support | Money OS', description: 'Search help articles, browse guides, or contact the Money OS team.' },
};

export default function SupportPage() {
  return <SupportClient />;
}
