import React from 'react';
import Link from 'next/link';
import { Building2, BarChart3, Wallet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function SmallBusinessesUseCase() {
  return (
    <div className="flex flex-col items-center pb-24">
      <section className="w-full pt-32 pb-24 px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[12px] font-medium text-blue-400 mb-8">
            Money OS for Small Businesses
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Know your numbers.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Run your payroll, track operational expenses, and maintain strict budgeting rules across multiple bank accounts in real-time.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
             <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-24 px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Wallet className="w-6 h-6 text-blue-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Multi-Account Sync</h3>
              <p className="text-[14px] text-neutral-400">Keep track of your checking, savings, and credit lines in one unified dashboard.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <BarChart3 className="w-6 h-6 text-blue-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Real-time P&L</h3>
              <p className="text-[14px] text-neutral-400">Instantly view month-to-date net positions and cash flow distributions without running massive reports.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Building2 className="w-6 h-6 text-blue-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Team Access</h3>
              <p className="text-[14px] text-neutral-400">Add your operational manager to the ledger with restricted permissions to log expenses safely.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
