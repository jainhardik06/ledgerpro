import type { Metadata } from 'next';
import SecurityClient from './SecurityClient';

export const metadata: Metadata = {
  title: 'Security | Money OS',
  description: 'How Money OS protects your financial data — encryption, access controls, and the security practices behind the platform.',
  alternates: { canonical: '/security' },
  openGraph: { title: 'Security | Money OS', description: 'How Money OS protects your financial data.', url: '/security', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Security | Money OS', description: 'How Money OS protects your financial data.' },
};

export default function SecurityPage() {
  return <SecurityClient />;
}
