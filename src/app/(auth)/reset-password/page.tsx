"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Password strength calc
  const getStrength = (pw: string) => {
    let score = 0;
    if (pw.length > 8) score += 25;
    if (pw.match(/[A-Z]/)) score += 25;
    if (pw.match(/[0-9]/)) score += 25;
    if (pw.match(/[^A-Za-z0-9]/)) score += 25;
    return score;
  };
  const strength = getStrength(password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Password Updated</h1>
        <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
          Your password has been successfully reset. You can now log in.
        </p>
        <Link href="/login" className="w-full">
           <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium">Log In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Set new password</h1>
      <p className="text-[14px] text-neutral-400 mb-8">Please enter a new secure password for your account.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">New Password</label>
          <Input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            autoFocus 
            className="h-12 bg-[#0a0a0a] border-white/[0.1] text-white focus-visible:ring-white/[0.2] text-[15px] mb-2"
            placeholder="••••••••"
          />
           {/* Password Strength Meter */}
           {password && (
            <div className="flex gap-1 h-1 w-full">
              <div className={`h-full flex-1 rounded-full ${strength > 0 ? (strength < 50 ? 'bg-rose-500' : strength < 100 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-white/[0.1]'}`} />
              <div className={`h-full flex-1 rounded-full ${strength >= 50 ? (strength < 100 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-white/[0.1]'}`} />
              <div className={`h-full flex-1 rounded-full ${strength >= 75 ? (strength < 100 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-white/[0.1]'}`} />
              <div className={`h-full flex-1 rounded-full ${strength >= 100 ? 'bg-emerald-500' : 'bg-white/[0.1]'}`} />
            </div>
          )}
        </div>
        
        <Button 
          type="submit" 
          disabled={password.length < 8} 
          className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
        >
          Update Password <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </Button>
      </form>
    </div>
  );
}
