import React from 'react';
import Link from 'next/link';
import { DollarSign, Share2, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function AffiliatesPage() {
  return (
    <div className="flex flex-col items-center pb-24">
      <section className="w-full pt-32 pb-24 px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-6 animate-in">Partner Program</h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Earn a 20% recurring commission for every customer you refer to Money OS.
          </p>
          <div className="mt-8 animate-in" style={{ animationDelay: '200ms' }}>
            <Button className="bg-white text-black hover:bg-neutral-200">Apply to Partner Program</Button>
          </div>
        </div>
      </section>

      <section className="w-full py-24 px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <Share2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">1. Share</h3>
              <p className="text-[14px] text-neutral-400">Get a custom tracking link to share with your audience, clients, or community.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <PieChart className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">2. Track</h3>
              <p className="text-[14px] text-neutral-400">View your clicks, conversions, and pending payouts in a dedicated partner dashboard.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                <DollarSign className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">3. Earn</h3>
              <p className="text-[14px] text-neutral-400">Receive 20% of their subscription revenue every month, for as long as they are a customer.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
