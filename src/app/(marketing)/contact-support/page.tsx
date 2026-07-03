import type { Metadata } from 'next';
import ContactSupportClient from './ContactSupportClient';

export const metadata: Metadata = {
  title: 'Contact Support | Money OS',
  description: 'Reach the Money OS support team for help with your workspace, billing, or a technical issue.',
  alternates: { canonical: '/contact-support' },
  openGraph: { title: 'Contact Support | Money OS', description: 'Reach the Money OS support team for help.', url: '/contact-support', type: 'website' },
  twitter: { card: 'summary', title: 'Contact Support | Money OS', description: 'Reach the Money OS support team for help.' },
};

export default function ContactSupportPage() {
  return <ContactSupportClient />;
}
