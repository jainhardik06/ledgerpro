import type { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact | Money OS',
  description: 'Get in touch with the Money OS team — questions, feedback, or partnership inquiries.',
  alternates: { canonical: '/contact' },
  openGraph: { title: 'Contact | Money OS', description: 'Get in touch with the Money OS team.', url: '/contact', type: 'website' },
  twitter: { card: 'summary', title: 'Contact | Money OS', description: 'Get in touch with the Money OS team.' },
};

export default function ContactPage() {
  return <ContactClient />;
}
