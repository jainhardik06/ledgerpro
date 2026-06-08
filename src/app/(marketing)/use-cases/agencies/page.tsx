import React from 'react';
import Link from 'next/link';
import { Briefcase, Users, Repeat, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AgenciesUseCase() {
  return (
    <div className="flex flex-col w-full pb-24">
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-fuchsia-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[12px] font-medium text-fuchsia-400 mb-8">
            Money OS for Agencies
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Retainers, tracked cleanly.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Manage client budgets, automate recurring retainers, and isolate project expenses without juggling multiple accounting softwares.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
             <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Briefcase className="w-6 h-6 text-fuchsia-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Project Budgets</h3>
              <p className="text-[14px] text-neutral-400">Set strict limits on contractor and software expenses for specific client campaigns.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Repeat className="w-6 h-6 text-fuchsia-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Automated Retainers</h3>
              <p className="text-[14px] text-neutral-400">Set it and forget it. Let Money OS automatically post your monthly client retainers to the ledger.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Users className="w-6 h-6 text-fuchsia-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Multi-tenant Access</h3>
              <p className="text-[14px] text-neutral-400">Manage multiple distinct agency brands or LLCs from a single login using our tenant isolation architecture.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
