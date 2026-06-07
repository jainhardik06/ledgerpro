import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Triangle } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#000000] text-[#ededed] font-sans selection:bg-neutral-800 selection:text-white flex flex-col md:flex-row relative">
      
      {/* Background Grid Pattern for texture */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Persistent Back Button */}
      <div className="absolute top-8 left-8 z-50">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] font-medium text-neutral-500 hover:text-white transition-colors group">
          <div className="w-6 h-6 rounded-full border border-white/[0.1] bg-[#0a0a0a] flex items-center justify-center group-hover:border-white/[0.2] transition-colors">
            <ArrowLeft className="w-3 h-3" />
          </div>
          Back to Money OS
        </Link>
      </div>

      {/* Left Canvas - Form Container */}
      <div className="flex-1 flex flex-col justify-center px-6 py-24 sm:px-12 md:px-24 z-10">
        <div className="w-full max-w-[400px] mx-auto">
          <div className="mb-12 flex items-center gap-3">
             <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <Triangle className="w-5 h-5 text-neutral-300 fill-current" />
            </div>
            <span className="font-semibold tracking-tight text-white text-lg">Money OS</span>
          </div>
          {children}
        </div>
      </div>

      {/* Right Canvas - Abstract Trust Indicators (Hidden on mobile) */}
      <div className="hidden md:flex flex-1 border-l border-white/[0.05] bg-[#050505] relative overflow-hidden flex-col items-center justify-center p-12 z-10">
        
        {/* Subtle radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-800/10 via-transparent to-transparent" />

        <div className="relative w-full max-w-md space-y-6">
          <h2 className="text-xl font-medium text-white tracking-tight mb-8 text-center">Enterprise-grade financial infrastructure.</h2>
          
          {/* Visual Trust Indicator 1 */}
          <div className="p-6 rounded-2xl border border-white/[0.05] bg-[#000000] shadow-2xl animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-emerald-500 font-mono tracking-widest uppercase">Connection Secured</span>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500 w-full" />
            </div>
            <div className="mt-4 text-[12px] text-neutral-500 font-mono flex items-center justify-between">
              <span>TLS 1.3</span>
              <span>SHA-256</span>
            </div>
          </div>

          {/* Visual Trust Indicator 2 */}
          <div className="p-6 rounded-2xl border border-white/[0.05] bg-[#000000] shadow-2xl animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: '200ms' }}>
             <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-neutral-400 font-mono tracking-widest uppercase">Tenant Boundary</span>
              <span className="text-[11px] text-neutral-500 font-mono">Isolated</span>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="h-8 flex-1 border border-white/[0.05] rounded-lg bg-neutral-900/50" />
                <div className="h-8 flex-1 border border-white/[0.05] rounded-lg bg-neutral-900/50" />
                <div className="h-8 flex-1 border border-emerald-500/20 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
                <div className="h-8 flex-1 border border-white/[0.05] rounded-lg bg-neutral-900/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
