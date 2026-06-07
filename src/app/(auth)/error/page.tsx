"use client";

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertOctagon, Clock, Lock, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function ErrorContent() {
  const searchParams = useSearchParams();
  const type = searchParams.get('type') || 'unauthorized';

  const errors = {
    unauthorized: {
      icon: Lock,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10 border-rose-500/20',
      title: 'Access Denied',
      desc: 'You do not have permission to view this resource. Please log in with an authorized account.'
    },
    suspended: {
      icon: AlertOctagon,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10 border-amber-500/20',
      title: 'Account Suspended',
      desc: 'Your workspace has been temporarily suspended. Please contact support or update your billing information.'
    },
    expired: {
      icon: Clock,
      color: 'text-neutral-400',
      bg: 'bg-neutral-800/50 border-white/[0.1]',
      title: 'Session Expired',
      desc: 'For your security, we have automatically logged you out due to inactivity.'
    },
    maintenance: {
      icon: Settings,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10 border-indigo-500/20',
      title: 'Scheduled Maintenance',
      desc: 'Money OS is currently undergoing planned upgrades to improve performance. We will be back online shortly.'
    }
  };

  const config = errors[type as keyof typeof errors] || errors.unauthorized;
  const Icon = config.icon;

  return (
    <div className="animate-in zoom-in-95 duration-500 text-center flex flex-col items-center">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 border ${config.bg}`}>
        <Icon className={`w-8 h-8 ${config.color}`} />
      </div>
      
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">{config.title}</h1>
      <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
        {config.desc}
      </p>

      <div className="flex flex-col gap-3 w-full">
        {type === 'maintenance' ? (
          <Link href="/status">
            <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium">Check Status Page</Button>
          </Link>
        ) : (
          <Link href="/login">
            <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium">Return to Login</Button>
          </Link>
        )}
      </div>

      {/* Demo Controls (Hidden in prod) */}
      <div className="mt-16 pt-8 border-t border-white/[0.05] flex gap-2 justify-center opacity-30 hover:opacity-100 transition-opacity">
        <Link href="?type=unauthorized" className="text-[10px] text-neutral-500 hover:text-white uppercase">401</Link>
        <Link href="?type=suspended" className="text-[10px] text-neutral-500 hover:text-white uppercase">Suspend</Link>
        <Link href="?type=expired" className="text-[10px] text-neutral-500 hover:text-white uppercase">Expire</Link>
        <Link href="?type=maintenance" className="text-[10px] text-neutral-500 hover:text-white uppercase">Maint</Link>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-neutral-500" /></div>}>
      <ErrorContent />
    </Suspense>
  );
}
