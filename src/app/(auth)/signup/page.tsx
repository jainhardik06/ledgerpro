"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, AlertCircle, CheckCircle2, UserCircle, Briefcase, Building2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type SignupStep = 'credentials' | 'organization' | 'usecase' | 'success';

/**
 * The onboarding picker is a friendlier front for `Tenant.appMode` (PRD §86
 * verticals). Freelancer and Business both run the Standard workspace; only
 * Agency and Student Club change terminology downstream.
 */
const USE_CASE_TO_APP_MODE: Record<string, 'Standard' | 'Student_Club' | 'Agency'> = {
  freelancer: 'Standard',
  business: 'Standard',
  agency: 'Agency',
  club: 'Student_Club',
};

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [useCase, setUseCase] = useState('');

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

  const handleNext = (e: React.FormEvent, nextStep: SignupStep) => {
    e.preventDefault();
    setStep(nextStep);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName,
          username: email,
          password,
          appMode: USE_CASE_TO_APP_MODE[useCase] || 'Standard',
        })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setStep('success');
        setTimeout(() => {
          window.location.href = data.redirectTo || '/dashboard';
        }, 2000);
      } else {
        setError(data.error || 'Failed to create workspace');
        setStep('credentials'); // Go back to fix
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setStep('credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      
      {/* Progress Indicator */}
      {step !== 'success' && (
        <div className="flex gap-2 mb-12">
           <div className={`h-1 flex-1 rounded-full ${step === 'credentials' || step === 'organization' || step === 'usecase' ? 'bg-white' : 'bg-white/[0.1]'}`} />
           <div className={`h-1 flex-1 rounded-full ${step === 'organization' || step === 'usecase' ? 'bg-white' : 'bg-white/[0.1]'}`} />
           <div className={`h-1 flex-1 rounded-full ${step === 'usecase' ? 'bg-white' : 'bg-white/[0.1]'}`} />
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-3 p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-[13px] font-medium text-rose-500 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* STEP 1: CREDENTIALS */}
      {step === 'credentials' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Create your account</h1>
          <p className="text-[14px] text-neutral-400 mb-8">Enter your details to get started.</p>

          <form onSubmit={(e) => handleNext(e, 'organization')} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">Work Email</label>
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
            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">Secure Password</label>
              <Input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
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
              disabled={!email || password.length < 8} 
              className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
            >
              Continue <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-[13px] text-neutral-500">
              Already have an account? <Link href="/login" className="text-white hover:underline underline-offset-4">Log in</Link>
            </p>
          </div>
        </div>
      )}

      {/* STEP 2: ORGANIZATION */}
      {step === 'organization' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <button onClick={() => setStep('credentials')} className="text-[12px] text-neutral-500 hover:text-white mb-6">← Back</button>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Name your workspace</h1>
          <p className="text-[14px] text-neutral-400 mb-8">This is your secure, isolated tenant environment.</p>

          <form onSubmit={(e) => handleNext(e, 'usecase')} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">Company or Organization Name</label>
              <Input 
                type="text" 
                value={tenantName} 
                onChange={e => setTenantName(e.target.value)} 
                required 
                autoFocus 
                className="h-12 bg-[#0a0a0a] border-white/[0.1] text-white focus-visible:ring-white/[0.2] text-[15px]"
                placeholder="Acme Corp"
              />
            </div>
            
            <Button 
              type="submit" 
              disabled={!tenantName} 
              className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
            >
              Continue <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Button>
          </form>
        </div>
      )}

      {/* STEP 3: USE CASE */}
      {step === 'usecase' && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-500">
          <button onClick={() => setStep('organization')} className="text-[12px] text-neutral-500 hover:text-white mb-6">← Back</button>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">How will you use it?</h1>
          <p className="text-[14px] text-neutral-400 mb-8">We'll tailor the initial setup for your needs.</p>

          <form onSubmit={handleFinalSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'freelancer', label: 'Freelancer', icon: UserCircle },
                { id: 'agency', label: 'Agency', icon: Briefcase },
                { id: 'business', label: 'Business', icon: Building2 },
                { id: 'club', label: 'Student Club', icon: GraduationCap },
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setUseCase(option.id)}
                  className={`flex flex-col items-center justify-center p-6 rounded-xl border transition-all ${
                    useCase === option.id 
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-white' 
                      : 'border-white/[0.05] bg-[#0a0a0a] text-neutral-400 hover:border-white/[0.2] hover:text-white'
                  }`}
                >
                  <option.icon className={`w-6 h-6 mb-3 ${useCase === option.id ? 'text-emerald-400' : 'text-neutral-500'}`} />
                  <span className="text-[13px] font-medium">{option.label}</span>
                </button>
              ))}
            </div>
            
            <Button 
              type="submit" 
              disabled={loading || !useCase} 
              className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Provision Workspace'}
            </Button>
          </form>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 'success' && (
        <div className="animate-in zoom-in-95 duration-500 text-center flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Workspace Ready</h1>
          <p className="text-[14px] text-neutral-400 mb-8">Redirecting you to the dashboard...</p>
          <RefreshCw className="w-5 h-5 text-neutral-600 animate-spin" />
        </div>
      )}

    </div>
  );
}
