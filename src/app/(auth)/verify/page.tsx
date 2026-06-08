"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');

  useEffect(() => {
    const timer = setTimeout(() => {
      const token = new URLSearchParams(window.location.search).get('token');
      setStatus(token ? 'success' : 'failed');
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (status === 'verifying') {
    return (
      <div className="animate-in fade-in duration-500 text-center flex flex-col items-center py-12">
        <RefreshCw className="w-8 h-8 text-neutral-500 animate-spin mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-2">Verifying your email...</h1>
        <p className="text-[14px] text-neutral-400">Please wait while we confirm your identity.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="animate-in zoom-in-95 duration-500 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Email Verified</h1>
        <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
          Your identity has been confirmed. You can now access your workspace.
        </p>
        <Link href="/dashboard" className="w-full">
           <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium">Continue to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in zoom-in-95 duration-500 text-center flex flex-col items-center">
      <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-6 border border-rose-500/20">
        <AlertTriangle className="w-8 h-8 text-rose-500" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Verification Failed</h1>
      <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
        The verification link is invalid or has expired. Please request a new one.
      </p>
      <div className="flex flex-col gap-3 w-full">
        <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium" onClick={() => setStatus('verifying')}>
          Resend Link
        </Button>
        <Link href="/login" className="text-[13px] font-medium text-neutral-500 hover:text-white transition-colors mt-2">
          Return to login
        </Link>
      </div>
    </div>
  );
}
