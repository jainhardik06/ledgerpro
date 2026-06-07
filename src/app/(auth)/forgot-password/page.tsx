"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate network request
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
          <Mail className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Check your email</h1>
        <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
          We sent a password recovery link to <span className="text-white font-medium">{email}</span>.
        </p>
        <Link href="/login" className="text-[13px] font-medium text-neutral-500 hover:text-white transition-colors">
          ← Return to login
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Reset password</h1>
      <p className="text-[14px] text-neutral-400 mb-8">Enter your work email and we'll send you a recovery link.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">Email Address</label>
          <Input 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
            autoFocus 
            className="h-12 bg-[#0a0a0a] border-white/[0.1] text-white focus-visible:ring-white/[0.2] text-[15px]"
            placeholder="admin@example.com"
          />
        </div>
        
        <Button 
          type="submit" 
          disabled={!email} 
          className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
        >
          Send Recovery Link <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </Button>
      </form>

      <div className="mt-8 text-center">
        <Link href="/login" className="text-[13px] font-medium text-neutral-500 hover:text-white transition-colors">
          ← Return to login
        </Link>
      </div>
    </div>
  );
}
