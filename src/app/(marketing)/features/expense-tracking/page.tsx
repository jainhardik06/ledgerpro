import React from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expense Tracking, Re-Engineered for Speed | Money OS',
  description: 'Log, import via CSV, and auto-categorize every business expense and income in Money OS — search your full history in milliseconds.',
  alternates: { canonical: '/features/expense-tracking' },
  openGraph: { title: 'Expense Tracking, Re-Engineered for Speed | Money OS', description: 'Log, import, and auto-categorize every business expense and income.', url: '/features/expense-tracking', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Expense Tracking, Re-Engineered for Speed | Money OS', description: 'Log, import, and auto-categorize every business expense and income.' },
};

export default function ExpenseTrackingFeature() {
  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-8 animate-in">
            <Activity className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Expense Tracking,<br />re-engineered for speed.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Forget clunky forms and loading spinners. Log your expenses via keyboard shortcuts in milliseconds and instantly see the impact on your bottom line.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
            <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Start Tracking Free</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-4 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-transparent to-transparent z-10" />
          
          <div className="flex flex-col gap-2 relative z-0 opacity-80 transition-opacity duration-500 group-hover:opacity-100">
            {/* Fake Table Row Header */}
            <div className="flex justify-between items-center text-[11px] text-neutral-500 font-medium px-4 py-2 border-b border-white/[0.05]">
              <span>Description</span>
              <span>Category</span>
              <span>Amount</span>
            </div>
            {/* Fake Table Rows */}
            {[
              { d: 'AWS Server Hosting', c: 'Infrastructure', a: '-₹14,500' },
              { d: 'Linear Subscription', c: 'Software', a: '-₹1,200' },
              { d: 'Client Retainer - Acme', c: 'Income', a: '+₹85,000', positive: true },
              { d: 'Team Lunch', c: 'Meals', a: '-₹3,400' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center text-[13px] text-neutral-300 font-medium px-4 py-3 bg-[#000000] rounded-lg border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${row.positive ? 'bg-emerald-500' : 'bg-neutral-600'}`} />
                  {row.d}
                </div>
                <div className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] border border-white/[0.05]">{row.c}</div>
                <div className={row.positive ? 'text-emerald-400' : 'text-white'}>{row.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16">
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <Zap className="w-6 h-6 text-white shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Zero-Latency Input</h3>
                <p className="text-[14px] text-neutral-400">Our database architecture is optimized for write speeds. Hit save, and your ledger updates instantly without full page reloads.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-white shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Double-Entry Accuracy</h3>
                <p className="text-[14px] text-neutral-400">Under the hood, every transaction is securely linked between accounts and categories, ensuring your books always balance perfectly.</p>
              </div>
            </div>
          </div>
          <div className="space-y-8">
             <div className="flex items-start gap-4">
              <Activity className="w-6 h-6 text-white shrink-0 mt-1" />
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">Real-Time Rollups</h3>
                <p className="text-[14px] text-neutral-400">The moment an expense is logged, your month-to-date profit/loss metrics and budget utilizations are recalculated globally.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full mt-16 px-6 max-w-3xl mx-auto text-center border-t border-white/[0.05] pt-24">
        <h2 className="text-3xl font-semibold text-white mb-6">Stop managing money in spreadsheets.</h2>
        <Link href="/login">
          <Button className="h-12 px-8 bg-white text-black hover:bg-neutral-200">Start Tracking Free <ArrowRight className="w-4 h-4 ml-2" /></Button>
        </Link>
      </section>
    </div>
  );
}
