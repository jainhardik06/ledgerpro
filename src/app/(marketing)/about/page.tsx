import type { Metadata } from 'next';
import AboutClient from './AboutClient';

export const metadata: Metadata = {
  title: 'About | Money OS',
  description: 'Why Money OS exists: a financial command center built for freelancers, agencies, and small teams who need clarity without accounting-software complexity.',
  alternates: { canonical: '/about' },
  openGraph: { title: 'About | Money OS', description: 'Why Money OS exists and who it is built for.', url: '/about', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'About | Money OS', description: 'Why Money OS exists and who it is built for.' },
};

export default function AboutPage() {
  return <AboutClient />;
}
