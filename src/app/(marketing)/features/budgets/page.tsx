import React from 'react';
import Link from 'next/link';
import { Target, ArrowRight, AlertTriangle, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function BudgetsFeature() {
  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-8 animate-in">
            <Target className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Budgets that actually work.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Set category-level limits, track utilization in real-time, and catch overspending before it ruins your cash flow.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
            <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Set Up Budgets</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden group">
            <div className="flex justify-between items-end mb-4">
              <div>
                <div className="text-[11px] text-neutral-500 font-medium mb-1 uppercase tracking-widest">Marketing Budget</div>
                <div className="text-2xl font-semibold text-white">₹45,000</div>
              </div>
              <div className="text-[13px] text-rose-400 font-medium">90% Used</div>
            </div>
            {/* Progress Bar Abstract */}
            <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full bg-rose-500 w-[90%]" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-[12px] text-neutral-400">
               <AlertTriangle className="w-3 h-3 text-rose-400" /> Approaching limit
            </div>
          </div>

           <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden group">
            <div className="flex justify-between items-end mb-4">
              <div>
                <div className="text-[11px] text-neutral-500 font-medium mb-1 uppercase tracking-widest">Software Subscriptions</div>
                <div className="text-2xl font-semibold text-white">₹12,000</div>
              </div>
              <div className="text-[13px] text-emerald-400 font-medium">40% Used</div>
            </div>
            {/* Progress Bar Abstract */}
            <div className="w-full h-2 rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full bg-emerald-500 w-[40%]" />
            </div>
             <div className="mt-4 flex items-center gap-2 text-[12px] text-neutral-400">
               <PieChart className="w-3 h-3 text-emerald-400" /> On track
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Text */}
      <section className="w-full py-16 px-6 max-w-4xl mx-auto text-center">
         <h2 className="text-3xl font-semibold text-white mb-6">Stop guessing your runway.</h2>
         <p className="text-neutral-400 max-w-2xl mx-auto leading-relaxed">
           Budgets in Money OS are strictly enforced against your real-time expenses. No manual syncing or delayed reports. As soon as a team member logs a debit, the category utilization bar fills up. You immediately know exactly how much capital is left to deploy.
         </p>
      </section>
    </div>
  );
}
