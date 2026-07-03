import type { Metadata } from 'next';
import StatusClient from './StatusClient';

export const metadata: Metadata = {
  title: 'System Status | Money OS',
  description: 'Live system status for Money OS — uptime and incident history for the platform and its core services.',
  alternates: { canonical: '/status' },
  openGraph: { title: 'System Status | Money OS', description: 'Live system status and incident history for Money OS.', url: '/status', type: 'website' },
  twitter: { card: 'summary', title: 'System Status | Money OS', description: 'Live system status and incident history for Money OS.' },
};

export default function StatusPage() {
  return <StatusClient />;
}
