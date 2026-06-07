"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        window.location.href = '/dashboard';
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Welcome back</h1>
      <p className="text-[14px] text-neutral-400 mb-8">Log in to your Money OS workspace to continue.</p>

      {error && (
        <div className="mb-6 flex items-center gap-3 p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-[13px] font-medium text-rose-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[13px] font-medium mb-1.5 text-neutral-300">Username</label>
          <Input 
            type="text" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            autoFocus 
            className="h-12 bg-[#0a0a0a] border-white/[0.1] text-white focus-visible:ring-white/[0.2] text-[15px]"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[13px] font-medium text-neutral-300">Password</label>
            <Link href="/forgot-password" className="text-[12px] font-medium text-neutral-500 hover:text-white transition-colors">
              Forgot password?
            </Link>
          </div>
          <Input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
            className="h-12 bg-[#0a0a0a] border-white/[0.1] text-white focus-visible:ring-white/[0.2] text-[15px]"
            placeholder="••••••••"
          />
        </div>
        
        <Button 
          type="submit" 
          disabled={loading || !username || !password} 
          className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium mt-4 group"
        >
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (
            <>
              Sign in <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-[13px] text-neutral-500">
          Don't have a workspace? <Link href="/signup" className="text-white hover:underline underline-offset-4">Create one for free</Link>
        </p>
      </div>
    </div>
  );
}
