import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function CareersPage() {
  return (
    <div className="flex flex-col items-center pb-24">
      <section className="w-full pt-32 pb-16 px-6 border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">Join the Team</h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Help us build the fastest financial operating system on the web.
          </p>
        </div>
      </section>

      <section className="w-full py-24 px-6 max-w-4xl mx-auto">
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-4">Open Roles</h2>
          <p className="text-[15px] text-neutral-400">We are a small, fully remote team. We value high agency, exceptional taste, and a bias for action.</p>
        </div>

        <div className="space-y-4">
          <Link href="/careers/senior-frontend-engineer" className="group block p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors">
             <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1 group-hover:text-emerald-400 transition-colors">Senior Frontend Engineer</h3>
                  <div className="text-[13px] text-neutral-500">Remote (Americas / Europe) • Full-time</div>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-600 group-hover:text-emerald-400 transition-colors" />
             </div>
          </Link>

          <Link href="/careers/product-designer" className="group block p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors">
             <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1 group-hover:text-emerald-400 transition-colors">Product Designer</h3>
                  <div className="text-[13px] text-neutral-500">Remote • Full-time</div>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-600 group-hover:text-emerald-400 transition-colors" />
             </div>
          </Link>
          
           <Link href="/careers/backend-engineer" className="group block p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors">
             <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1 group-hover:text-emerald-400 transition-colors">Backend Engineer (Node/MongoDB)</h3>
                  <div className="text-[13px] text-neutral-500">Remote (Americas) • Full-time</div>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-600 group-hover:text-emerald-400 transition-colors" />
             </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
