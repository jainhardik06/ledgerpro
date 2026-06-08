import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import React from 'react';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session || session.role !== 'TENANT_ADMIN') {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
