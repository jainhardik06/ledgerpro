"use client";

import React from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, DollarSign, ArrowRight } from 'lucide-react';

export default function RevenuePage() {
  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Revenue Intelligence</h1>
          <p className="text-[14px] text-neutral-400 mt-1">Real-time subscription billing and cohort analysis.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Total MRR</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">$124,500</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+14.2%</span>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Net Retention</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">108.4%</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+2.1%</span>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">ARPA</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">$147</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+$12</span>
          </div>
        </div>
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Churn Rate</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">1.2%</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowDownRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">-0.4%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Mock Chart Area */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-6 flex flex-col min-h-[400px]">
           <div className="flex items-center justify-between mb-8">
             <h2 className="text-[13px] font-medium text-white uppercase tracking-widest">MRR Growth (12 Months)</h2>
             <select className="bg-[#000000] border border-white/[0.1] text-white text-[12px] rounded px-2 py-1 outline-none">
               <option>All Plans</option>
               <option>Enterprise</option>
             </select>
           </div>
           <div className="flex-1 flex items-end justify-between gap-2 px-4 pb-4">
             {/* Simple CSS Bar Chart Mock */}
             {[40, 45, 48, 55, 62, 70, 75, 82, 85, 92, 100, 110].map((h, i) => (
               <div key={i} className="w-full bg-emerald-500/20 hover:bg-emerald-500/40 transition-colors rounded-t-sm relative group cursor-pointer" style={{ height: `${(h/110)*100}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-mono px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    ${h}k
                  </div>
               </div>
             ))}
           </div>
        </div>

        {/* Plan Distribution */}
        <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-6">
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-8">Plan Distribution</h2>
           <div className="space-y-6">
              <div>
                <div className="flex justify-between text-[13px] mb-2">
                  <span className="text-white font-medium">Enterprise</span>
                  <span className="text-neutral-400 font-mono">$80,200 (64%)</span>
                </div>
                <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[64%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[13px] mb-2">
                  <span className="text-white font-medium">Team</span>
                  <span className="text-neutral-400 font-mono">$32,100 (26%)</span>
                </div>
                <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-[26%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[13px] mb-2">
                  <span className="text-white font-medium">Pro</span>
                  <span className="text-neutral-400 font-mono">$12,200 (10%)</span>
                </div>
                <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-neutral-400 w-[10%]" />
                </div>
              </div>
           </div>

           <div className="mt-8 pt-6 border-t border-white/[0.05]">
             <button className="flex items-center gap-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">
               Open Stripe Billing Dashboard <ArrowRight className="w-3.5 h-3.5" />
             </button>
           </div>
        </div>

      </div>

    </div>
  );
}
