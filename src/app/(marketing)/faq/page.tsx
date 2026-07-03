import type { Metadata } from 'next';
import FAQClient from './FAQClient';

export const metadata: Metadata = {
  title: 'FAQ | Money OS',
  description: 'Frequently asked questions about Money OS — pricing, features, security, and how the platform works.',
  alternates: { canonical: '/faq' },
  openGraph: { title: 'FAQ | Money OS', description: 'Frequently asked questions about Money OS.', url: '/faq', type: 'website' },
  twitter: { card: 'summary', title: 'FAQ | Money OS', description: 'Frequently asked questions about Money OS.' },
};

export default function FAQPage() {
  return <FAQClient />;
}
