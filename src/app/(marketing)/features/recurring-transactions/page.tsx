import React from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowRight, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function RecurringTransactionsFeature() {
  return (
    <div className="flex flex-col items-center pb-24">
      {/* Hero */}
      <section className="w-full pt-32 pb-24 px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-8 animate-in">
            <RefreshCw className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Automate fixed expenses.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Never forget a subscription payment or a monthly retainer again. Set up recurring transactions that automatically post to your ledger.
          </p>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-24 px-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl">
          <div className="flex flex-col gap-4">
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-[#000000] border border-white/[0.05]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white">Office Rent</div>
                  <div className="text-[12px] text-neutral-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Monthly
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-semibold text-white">-₹120,000</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">Next run: Oct 1st</div>
              </div>
            </div>

             <div className="flex items-center justify-between p-4 rounded-lg bg-[#000000] border border-white/[0.05]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white">Retainer - Acme Corp</div>
                  <div className="text-[12px] text-neutral-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Weekly
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-semibold text-emerald-400">+₹25,000</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">Next run: Friday</div>
              </div>
            </div>

          </div>
        </div>
      </section>

    </div>
  );
}
