"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="flex flex-col items-center pb-24">
      {/* Header */}
      <section className="w-full pt-32 pb-16 px-6 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-6 animate-in">
          Simple, transparent pricing.
        </h1>
        <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto animate-in" style={{ animationDelay: '100ms' }}>
          Start for free, upgrade when you need more power and team collaboration.
        </p>

        {/* Toggle */}
        <div className="mt-10 inline-flex items-center gap-2 p-1 bg-white/[0.05] rounded-md border border-white/[0.05] animate-in" style={{ animationDelay: '200ms' }}>
          <button 
            className={`px-4 py-1.5 text-[13px] font-medium rounded ${!annual ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button 
            className={`px-4 py-1.5 text-[13px] font-medium rounded ${annual ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            onClick={() => setAnnual(true)}
          >
            Annually <span className="text-emerald-500 ml-1">(-20%)</span>
          </button>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="w-full px-6 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6 animate-in" style={{ animationDelay: '300ms' }}>
          
          {/* Free Tier */}
          <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-2">Free</h3>
            <p className="text-[13px] text-neutral-400 mb-6">Perfect for individuals and side-projects.</p>
            <div className="mb-6">
              <span className="text-4xl font-semibold tracking-tight text-white">₹0</span>
              <span className="text-neutral-500 ml-1">/ mo</span>
            </div>
            <Link href="/login" className="w-full mb-8">
              <Button variant="outline" className="w-full border-white/[0.1] text-white hover:bg-white/[0.05]">Get Started</Button>
            </Link>
            <ul className="space-y-4 text-[13px] text-neutral-300 flex-1">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> 1 Workspace</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> 100 Transactions / mo</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Basic Analytics</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Standard Support</li>
            </ul>
          </div>

          {/* Pro Tier */}
          <div className="rounded-2xl border border-emerald-500/30 bg-[#000000] p-8 flex flex-col relative shadow-2xl shadow-emerald-900/20">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-white px-3 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase">
              Recommended
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Pro</h3>
            <p className="text-[13px] text-neutral-400 mb-6">For small businesses and growing teams.</p>
            <div className="mb-6">
              <span className="text-4xl font-semibold tracking-tight text-white">₹{annual ? '499' : '599'}</span>
              <span className="text-neutral-500 ml-1">/ mo</span>
            </div>
            <Link href="/login" className="w-full mb-8">
              <Button className="w-full bg-white text-black hover:bg-neutral-200">Start 14-day free trial</Button>
            </Link>
            <ul className="space-y-4 text-[13px] text-neutral-300 flex-1">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Unlimited Workspaces</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Unlimited Transactions</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Advanced Analytics & Reports</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Up to 5 Team Members</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-emerald-500" /> Priority Support</li>
            </ul>
          </div>

          {/* Team Tier */}
          <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-2">Team</h3>
            <p className="text-[13px] text-neutral-400 mb-6">For agencies and larger organizations.</p>
            <div className="mb-6">
              <span className="text-4xl font-semibold tracking-tight text-white">₹{annual ? '1499' : '1899'}</span>
              <span className="text-neutral-500 ml-1">/ mo</span>
            </div>
            <Link href="/login" className="w-full mb-8">
              <Button variant="outline" className="w-full border-white/[0.1] text-white hover:bg-white/[0.05]">Get Started</Button>
            </Link>
            <ul className="space-y-4 text-[13px] text-neutral-300 flex-1">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Everything in Pro</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Unlimited Team Members</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Detailed Audit Logs</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> API Access</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-neutral-500" /> Custom Roles & Permissions</li>
            </ul>
          </div>

        </div>
      </section>

      {/* FAQ */}
      <section className="w-full px-6 max-w-3xl mx-auto mt-32">
        <h2 className="text-2xl font-semibold text-white mb-8 text-center">Frequently Asked Questions</h2>
        <div className="space-y-6">
          {[
            { q: "Can I change my plan later?", a: "Yes, you can upgrade, downgrade, or cancel your plan at any time from your workspace settings." },
            { q: "How does the free trial work?", a: "You get full access to the Pro features for 14 days. No credit card required. If you don't upgrade, you'll be automatically downgraded to the Free tier." },
            { q: "What counts as a team member?", a: "Anyone you invite to your workspace with User or Admin privileges counts toward your team member limit." }
          ].map((faq, i) => (
            <div key={i} className="border-b border-white/[0.05] pb-6">
              <h4 className="text-[15px] font-medium text-white mb-2 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-neutral-500" /> {faq.q}
              </h4>
              <p className="text-[14px] text-neutral-400 pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
