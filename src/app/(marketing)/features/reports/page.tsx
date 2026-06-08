import React from 'react';
import Link from 'next/link';
import { BarChart3, TrendingUp, Download, PieChart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ReportsFeature() {
  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-8 animate-in">
            <BarChart3 className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Actionable Analytics.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            No more messy pivot tables. Real-time cash flow trends and expense distributions are generated instantly.
          </p>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
           <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl">
             <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <h3 className="text-[14px] font-semibold text-white">Cash Flow Trend</h3>
             </div>
             {/* Fake Area Chart */}
             <div className="w-full h-40 flex items-end gap-1 relative opacity-80">
                {Array.from({length: 20}).map((_, i) => (
                  <div key={i} className="flex-1 bg-indigo-500/20 rounded-t-sm" style={{ height: `${20 + Math.random() * 80}%` }} />
                ))}
             </div>
           </div>

           <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl">
             <div className="flex items-center gap-2 mb-8">
                <PieChart className="w-5 h-5 text-emerald-400" />
                <h3 className="text-[14px] font-semibold text-white">Expense Distribution</h3>
             </div>
             <div className="space-y-4">
                <div className="flex justify-between items-center text-[13px] border-b border-white/[0.05] pb-2">
                  <span className="text-neutral-400">Payroll</span>
                  <span className="text-white font-medium">65%</span>
                </div>
                <div className="flex justify-between items-center text-[13px] border-b border-white/[0.05] pb-2">
                  <span className="text-neutral-400">Infrastructure</span>
                  <span className="text-white font-medium">20%</span>
                </div>
                <div className="flex justify-between items-center text-[13px] border-b border-white/[0.05] pb-2">
                  <span className="text-neutral-400">Marketing</span>
                  <span className="text-white font-medium">10%</span>
                </div>
             </div>
           </div>
        </div>
      </section>

      <section className="w-full py-16 px-6 max-w-3xl mx-auto text-center">
         <h2 className="text-2xl font-semibold text-white mb-6">One-click Exports</h2>
         <p className="text-neutral-400 mb-8 leading-relaxed">
           Need to send data to your accountant? Money OS supports instant, clean XLSX exports of all your transaction data so you can hook it directly into standard enterprise reporting tools if needed.
         </p>
         <Button variant="outline" className="border-white/[0.1] text-white">
           <Download className="w-4 h-4 mr-2" /> Download Sample Report
         </Button>
      </section>
    </div>
  );
}
