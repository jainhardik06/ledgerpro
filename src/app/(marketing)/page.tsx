import React from 'react';
import Link from 'next/link';
import { ArrowRight, Zap, Shield, Layout, Target, LineChart, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function MarketingHome() {
  return (
    <div className="flex flex-col items-center">
      
      {/* Hero Section */}
      <section className="w-full flex flex-col items-center text-center pt-32 pb-24 px-6 relative overflow-hidden">
        {/* Subtle radial gradient background effect for OLED black */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/40 via-[#000000] to-[#000000] -z-10" />
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[12px] font-medium text-neutral-300 mb-8 animate-in" style={{ animationDelay: '100ms' }}>
          <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
          Money OS 2.0 is now live
        </div>
        
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tighter text-white max-w-4xl mb-6 animate-in leading-[1.1]" style={{ animationDelay: '200ms' }}>
          The financial command center for modern teams.
        </h1>
        
        <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mb-10 font-medium animate-in" style={{ animationDelay: '300ms' }}>
          End the spreadsheet chaos. Money OS provides precise expense tracking, tenant isolation, and actionable insights out of the box.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 animate-in" style={{ animationDelay: '400ms' }}>
          <Link href="/login">
            <Button size="default" className="h-10 px-6 bg-white text-black hover:bg-neutral-200 text-[14px]">
              Start your workspace <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <span className="text-[13px] text-neutral-500 font-mono">100% Free during Beta</span>
        </div>
      </section>

      {/* Trusted By Logos */}
      <section className="w-full border-y border-white/[0.05] bg-[#0a0a0a] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <p className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-8">Trusted by forward-thinking companies</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-40 grayscale">
            {/* Minimal SVG replacements for company logos */}
            <div className="text-xl font-bold tracking-tighter">ACME Corp</div>
            <div className="text-xl font-bold tracking-tighter">Vortex</div>
            <div className="text-xl font-bold tracking-tighter">Starlight</div>
            <div className="text-xl font-bold tracking-tighter">Quantum</div>
            <div className="text-xl font-bold tracking-tighter">Nexus</div>
          </div>
        </div>
      </section>

      {/* Problem / Solution Narrative */}
      <section className="w-full py-24 px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4">
              Accounting software doesn't have to be complicated.
            </h2>
            <p className="text-neutral-400 mb-6 leading-relaxed">
              Most financial tools are either too simple (spreadsheets) or wildly over-engineered (enterprise ERPs). Money OS hits the sweet spot: powerful double-entry principles wrapped in a brutally simple, high-performance interface.
            </p>
            <ul className="space-y-4">
              {[
                "Multi-tenant architecture built-in",
                "Strict role-based access control",
                "Real-time profit/loss metrics",
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-[14px] font-medium text-neutral-300">
                  <div className="w-5 h-5 rounded-full bg-white/[0.05] flex items-center justify-center border border-white/[0.1]">
                    <Zap className="w-3 h-3 text-emerald-400" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            {/* Abstract UI representation */}
            <div className="w-full aspect-square rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-50" />
              <div className="space-y-4">
                <div className="w-1/3 h-4 rounded bg-white/[0.05]" />
                <div className="w-full h-24 rounded-lg bg-white/[0.02] border border-white/[0.05]" />
                <div className="w-full h-12 rounded-lg bg-white/[0.02] border border-white/[0.05]" />
                <div className="w-full h-12 rounded-lg bg-white/[0.02] border border-white/[0.05]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="w-full py-24 px-6 bg-[#0a0a0a] border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl font-semibold tracking-tight text-white mb-4">Everything you need. Nothing you don't.</h2>
            <p className="text-neutral-400 max-w-xl">Designed for speed. Keyboard-first navigation, instant page loads, and zero layout shift.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Bento Card 1 */}
            <div className="md:col-span-2 rounded-2xl border border-white/[0.05] bg-[#000000] p-8 flex flex-col justify-end min-h-[300px] relative overflow-hidden group">
              <div className="absolute top-8 right-8 text-neutral-800 group-hover:text-neutral-700 transition-colors">
                <Layout className="w-24 h-24" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Beautiful Data Grids</h3>
              <p className="text-[14px] text-neutral-400 max-w-md">Our tables use tabular-nums, strict alignments, and custom focus states to make reviewing thousands of transactions effortless.</p>
            </div>

            {/* Bento Card 2 */}
            <div className="rounded-2xl border border-white/[0.05] bg-[#000000] p-8 flex flex-col justify-end min-h-[300px] relative overflow-hidden group">
              <div className="absolute top-8 right-8 text-neutral-800 group-hover:text-neutral-700 transition-colors">
                <Shield className="w-24 h-24" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Ironclad Security</h3>
              <p className="text-[14px] text-neutral-400">Tenant-isolation at the database level.</p>
            </div>

            {/* Bento Card 3 */}
            <div className="rounded-2xl border border-white/[0.05] bg-[#000000] p-8 flex flex-col justify-end min-h-[300px] relative overflow-hidden group">
               <div className="absolute top-8 right-8 text-neutral-800 group-hover:text-neutral-700 transition-colors">
                <Target className="w-24 h-24" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Budgets & Limits</h3>
              <p className="text-[14px] text-neutral-400">Set strict spending limits per category.</p>
            </div>

             {/* Bento Card 4 */}
             <div className="md:col-span-2 rounded-2xl border border-white/[0.05] bg-[#000000] p-8 flex flex-col justify-end min-h-[300px] relative overflow-hidden group">
              <div className="absolute top-8 right-8 text-neutral-800 group-hover:text-neutral-700 transition-colors">
                <LineChart className="w-24 h-24" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Real-time Analytics</h3>
              <p className="text-[14px] text-neutral-400 max-w-md">Instantly view cash flow trends, categorized distributions, and net positions without running heavy reports.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-white mb-6">Ready to regain control?</h2>
          <p className="text-lg text-neutral-400 mb-10 max-w-2xl mx-auto">
            Join hundreds of teams managing their finances with precision. Setup takes less than two minutes.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link href="/login">
              <Button size="default" className="h-12 px-8 bg-white text-black hover:bg-neutral-200 text-[15px]">
                Start your workspace
              </Button>
            </Link>
            <span className="text-[12px] text-neutral-500 font-mono">100% Free during Beta · No credit card required</span>
          </div>
        </div>
      </section>

    </div>
  );
}
