"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Cpu, Layers, Activity, FileText, Check, X, 
  ArrowUpRight, Lock, Database, Sparkles, Terminal, ArrowRight,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AudienceContent {
  challenges: string[];
  goals: string[];
  solution: string;
}

const AUDIENCE_DATA: Record<'freelancer' | 'agency' | 'org' | 'business', AudienceContent> = {
  freelancer: {
    challenges: [
      "Mixing personal and business expense records",
      "Manual tax estimation spreadsheets that easily break",
      "No clean way to share quick audit proofs with clients"
    ],
    goals: [
      "Complete isolation of project expenses",
      "Real-time tax tracking without accounting degree jargon",
      "Fast bookkeeping that takes under 5 minutes a week"
    ],
    solution: "Money OS provides freelancers with lightweight, isolated workspace ledgers. You get real-time categorization and exportable transaction logs built with zero complexity."
  },
  agency: {
    challenges: [
      "Tracking multiple client accounts and budgets simultaneously",
      "Fragmented software tool chains for billing, team tracking, and audits",
      "Sloppy manual reconciliation across various payment channels"
    ],
    goals: [
      "Unified operational workspace with distinct sub-ledgers",
      "Continuous budget tracking to prevent project overruns",
      "Direct API and CSV exports for quick external bookkeeping syncs"
    ],
    solution: "Agencies use Money OS to manage client accounts under distinct tenant workspace boundaries. Live dashboards show current allocations, budgets, and operational spending."
  },
  org: {
    challenges: [
      "Student coordinators or volunteers tracking club funds in messy chats",
      "Lack of shared visibility leading to trust issues in public funding",
      "Frequent treasurer turnovers losing historical records"
    ],
    goals: [
      "Public-facing read-only ledgers for absolute transparency",
      "Simple, clear dashboard accessible by non-finance volunteers",
      "Immutable operation logs that survive leadership changeovers"
    ],
    solution: "Money OS delivers collaborative financial clarity for student clubs and community organizations. With clear roles, read-only links, and transaction logs, everyone knows where funds are."
  },
  business: {
    challenges: [
      "Legacy bookkeeping tools taking minutes to load single lists",
      "High software costs for simple multi-user financial visibility",
      "Opaque reporting that only updates weeks after month-end"
    ],
    goals: [
      "Sub-100ms load times for instant operation management",
      "Role-based visibility so teams log expenses directly",
      "Zero manual data entry mistakes with strict pre-defined categories"
    ],
    solution: "For modern growing companies, Money OS is the speed-oriented alternative to traditional accounting. Keep operators aligned, budgets monitored, and records completely organized."
  }
};

export default function AboutClient() {
  const [activeAudience, setActiveAudience] = useState<'freelancer' | 'agency' | 'org' | 'business'>('freelancer');

  return (
    <div className="flex flex-col w-full bg-[#000000] text-white min-h-screen pb-32">
      
      {/* Hero Section */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 relative overflow-hidden border-b border-white/[0.05]">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/30 via-[#000000] to-[#000000] -z-10" />
        
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          {/* Version / Beta Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-medium text-indigo-400 mb-8 font-mono">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            100% Free For Beta Onboarding
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tighter text-white mb-6 leading-[1.1] max-w-3xl">
            Financial clarity, engineered for the way modern teams work.
          </h1>
          <p className="text-neutral-400 max-w-xl mb-8 text-[14px] md:text-[16px] leading-relaxed font-medium">
            Money OS is a fast, tenant-isolated ledger system that replaces spreadsheet chaos with absolute certainty. We help you understand and control your capital.
          </p>

          <div className="flex gap-4 mb-12">
            <Link href="/login">
              <Button size="default" className="bg-white text-black hover:bg-neutral-200 text-[12px] h-10 font-medium px-6">
                Start Workspace <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Button>
            </Link>
            <Link href="/support">
              <Button size="default" variant="ghost" className="border border-white/[0.1] text-white hover:bg-white/[0.05] text-[12px] h-10 font-medium px-6">
                Support Center
              </Button>
            </Link>
          </div>

          {/* Quick Technical Stats Bar — scrolls on mobile */}
          <div className="w-full max-w-3xl overflow-x-auto">
            <div className="grid grid-cols-3 border border-white/[0.05] rounded-xl bg-[#050505] p-4 text-left divide-x divide-white/[0.05] min-w-[480px]">
            <div className="px-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Architecture</div>
              <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" /> Tenant Isolated
              </div>
            </div>
            <div className="px-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Response Time</div>
              <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Sub-100ms Query
              </div>
            </div>
            <div className="px-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Security Standard</div>
              <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" /> Zero Password Storage
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Friction (The Problem) */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 border-b border-white/[0.05] relative">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-2">The Friction</span>
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">The tools we use shape how we manage.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#050505] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 font-mono text-[13px] font-bold">CSV</div>
                <h3 className="text-[16px] font-semibold text-white mb-2">Why Spreadsheets Fail</h3>
                <p className="text-[13px] text-neutral-400 leading-relaxed mb-4">
                  Spreadsheets are infinitely flexible, which is exactly why they break. A single mistyped formula can silently corrupt a quarter of financial records. They offer no immutable logs, no multi-user workspace boundaries, and require manual maintenance.
                </p>
              </div>
              <div className="text-[11px] font-mono text-rose-400 bg-rose-500/5 p-2.5 rounded border border-rose-500/10">
                ⚠️ Error: Circular reference detected on cell B42.
              </div>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#050505] flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
                  <X className="w-4 h-4" />
                </div>
                <h3 className="text-[16px] font-semibold text-white mb-2">Why Legacy Software Overwhelms</h3>
                <p className="text-[13px] text-neutral-400 leading-relaxed mb-4">
                  Traditional accounting packages are built for certified accountants, not operational teams. They are heavy, cluttered, slow to load, and force you to navigate complex double-entry forms just to track standard operational spending.
                </p>
              </div>
              <div className="text-[11px] font-mono text-amber-400 bg-amber-500/5 p-2.5 rounded border border-amber-500/10">
                ❌ Page failed to respond in 4.2 seconds. Reconnect?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Money OS Exists */}
      <section className="w-full py-16 sm:py-28 px-4 sm:px-6 bg-[#030303] border-b border-white/[0.05] relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-4">Our Thesis</span>
          <p className="text-xl md:text-2xl text-neutral-200 font-medium leading-relaxed mb-6 font-sans">
            "We believe financial software should respect your intelligence. Speed is not just a performance metric; it is an executive design constraint. We built Money OS because modern teams deserve clean data, fast interfaces, and absolute security."
          </p>
          <div className="text-[12px] font-mono text-neutral-500">
            — The Money OS Engineering Team
          </div>
        </div>
      </section>

      {/* Philosophy Principles */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-2">Engineering Rules</span>
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Our Core Philosophy</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#070707] hover:border-white/[0.1] transition-all">
              <div className="text-[11px] font-mono text-neutral-500 mb-2">01 / SPEED</div>
              <h3 className="text-[15px] font-medium text-white mb-2">Sub-100ms Execution</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                If an operations ledger takes more than 100ms to filter, search, or update, it creates cognitive lag. We design queries to respond instantly so you can stay in flow.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#070707] hover:border-white/[0.1] transition-all">
              <div className="text-[11px] font-mono text-neutral-500 mb-2">02 / INTERFACE DENSITY</div>
              <h3 className="text-[15px] font-medium text-white mb-2">Clarity Over Cosmetic Fluff</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                We avoid oversized cards, useless charts, and marketing padding. We prioritize structured data grids, monospace values, and fast layouts that maximize informational density.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#070707] hover:border-white/[0.1] transition-all">
              <div className="text-[11px] font-mono text-neutral-500 mb-2">03 / MATHEMATICAL SECURITY</div>
              <h3 className="text-[15px] font-medium text-white mb-2">Tenant Database Isolation</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                Security is built into our core database queries. Every workspace is completely isolated mathematically at the schema boundary, preventing cross-organization leakage.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#070707] hover:border-white/[0.1] transition-all">
              <div className="text-[11px] font-mono text-neutral-500 mb-2">04 / IMMUTABLE AUDITS</div>
              <h3 className="text-[15px] font-medium text-white mb-2">System Audit Trails</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                Every login attempt, category addition, and budget change writes an immutable audit record. Your financial statements are backed by a complete history of operators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Matrix */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-2">The Shift</span>
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">How we think about financial tools</h2>
          </div>

          <div className="border border-white/[0.05] rounded-xl overflow-x-auto bg-[#050505]">
            <table className="w-full text-[13px] border-collapse text-left min-w-[600px]">
              <thead>
                <tr className="border-b border-white/[0.05] bg-white/[0.02] text-neutral-400 font-mono text-[10px] uppercase tracking-widest">
                  <th className="p-4 font-semibold">Aspect</th>
                  <th className="p-4 font-semibold">Traditional Ledger Software</th>
                  <th className="p-4 font-semibold text-white">Money OS Approach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                <tr>
                  <td className="p-4 font-semibold text-white font-mono text-[11px]">Primary Focus</td>
                  <td className="p-4 text-neutral-400">Retrospective compliance reporting</td>
                  <td className="p-4 text-white font-medium">Real-time operational cash intelligence</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white font-mono text-[11px]">User Design</td>
                  <td className="p-4 text-neutral-400">Complex, multi-level dropdowns built for CPAs</td>
                  <td className="p-4 text-white font-medium">Minimal, high-density, keyboard-driven screens</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white font-mono text-[11px]">Speed Target</td>
                  <td className="p-4 text-neutral-400">Several seconds per page transition</td>
                  <td className="p-4 text-white font-medium">Sub-100ms server response benchmark</td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-white font-mono text-[11px]">Data Structure</td>
                  <td className="p-4 text-neutral-400">Shared multi-tenant database tables</td>
                  <td className="p-4 text-white font-medium">Strict isolated boundaries per client tenant</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Audience Segments (Interactive Tabbed Section) */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 border-b border-white/[0.05] relative">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-2">Designed For</span>
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Who we serve</h2>
          </div>

          {/* Minimalist Tab Selector */}
          <div className="flex justify-center gap-2 mb-10 border-b border-white/[0.05] pb-px overflow-x-auto">
            {(['freelancer', 'agency', 'org', 'business'] as const).map(role => (
              <button
                key={role}
                onClick={() => setActiveAudience(role)}
                className={`pb-3 px-4 text-[13px] font-medium transition-colors border-b-2 tracking-tight capitalize shrink-0 ${
                  activeAudience === role 
                    ? 'border-white text-white' 
                    : 'border-transparent text-neutral-500 hover:text-white'
                }`}
              >
                {role === 'org' ? 'Student Clubs / Orgs' : role === 'business' ? 'Small Businesses' : role}
              </button>
            ))}
          </div>

          {/* Dynamic Content Panel */}
          <div className="p-5 sm:p-8 rounded-xl border border-white/[0.05] bg-[#070707] grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
            <div>
              <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-widest mb-3">Core Challenges</div>
              <ul className="space-y-2">
                {AUDIENCE_DATA[activeAudience].challenges.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-[12px] text-neutral-300">
                    <span className="text-rose-500 font-bold shrink-0 mt-0.5">✕</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-widest mb-3">Target Goals</div>
              <ul className="space-y-2 mb-6">
                {AUDIENCE_DATA[activeAudience].goals.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-[12px] text-neutral-300">
                    <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/[0.05] pt-4 mt-4 text-[13px] text-neutral-400 italic leading-relaxed">
                {AUDIENCE_DATA[activeAudience].solution}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Trust Shield */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest block mb-2">Hardened Layer</span>
            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">Trust & Architectural Safety</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#050505]">
              <Database className="w-5 h-5 text-indigo-400 mb-4" />
              <h3 className="text-[14px] font-semibold text-white mb-2">Logical Isolation</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                Multi-tenant boundaries are strictly validated on every read/write action. We prevent cross-organization database queries at the framework layer.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#050505]">
              <Lock className="w-5 h-5 text-emerald-400 mb-4" />
              <h3 className="text-[14px] font-semibold text-white mb-2">Zero Raw Credentials</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                We never store plaintext passwords, and we never ask you for API access keys or passwords to external platforms.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#050505]">
              <FileText className="w-5 h-5 text-amber-400 mb-4" />
              <h3 className="text-[14px] font-semibold text-white mb-2">Immutable Logs</h3>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                System action events are logged to prevent tampering. Changes to ledger settings or budgets create permanent, auditable trails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Earned CTA */}
      <section className="w-full py-20 sm:py-28 px-4 sm:px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto flex flex-col items-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-white mb-6">
            Bring clarity to your business finances.
          </h2>
          <p className="text-neutral-400 text-[14px] max-w-md mb-8 leading-relaxed">
            Create an isolated project workspace in seconds. Money OS is 100% free to use for our beta users.
          </p>
          <div className="flex gap-4">
            <Link href="/login">
              <Button size="default" className="bg-white text-black hover:bg-neutral-200 text-[12px] h-10 font-medium px-6">
                Start Workspace
              </Button>
            </Link>
            <Link href="/docs">
              <Button size="default" variant="ghost" className="border border-white/[0.1] text-white hover:bg-white/[0.05] text-[12px] h-10 font-medium px-6">
                Read Docs
              </Button>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
