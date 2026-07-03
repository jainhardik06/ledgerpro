import React from 'react';
import Link from 'next/link';
import { ShieldAlert, FileText, Search, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Immutable Audit Trails | Money OS',
  description: 'Every transaction edit, budget change, and settings update recorded permanently in Money OS — a full, tamper-proof activity trail for your workspace.',
  alternates: { canonical: '/features/audit-logs' },
  openGraph: { title: 'Immutable Audit Trails | Money OS', description: 'A full, tamper-proof activity trail for every change in your workspace.', url: '/features/audit-logs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Immutable Audit Trails | Money OS', description: 'A full, tamper-proof activity trail for every change in your workspace.' },
};

export default function AuditLogsFeature() {
  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-800/20 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center mb-8 animate-in">
            <ShieldAlert className="w-8 h-8 text-neutral-300" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Immutable Audit Trails.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            When multiple people touch the ledger, trust is not enough. Money OS maintains an automatic, undeletable log of every single action taken within your workspace.
          </p>
          <div className="flex flex-col items-center gap-2 animate-in" style={{ animationDelay: '300ms' }}>
            <Link href="/login">
              <Button variant="outline" className="border-white/[0.1] text-white hover:bg-white/[0.05]">Start your workspace</Button>
            </Link>
            <span className="text-[12px] text-neutral-500 font-mono">100% Free during Beta</span>
          </div>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-1 shadow-2xl relative overflow-hidden group">
          <div className="bg-[#000000] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6 text-[13px] text-neutral-500 font-medium">
              <Search className="w-4 h-4" /> Filter by user, action, or date
            </div>
            
            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/[0.1] before:to-transparent">
              {/* Event 1 */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                 <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/[0.1] bg-[#000000] text-neutral-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 shadow">
                    <User className="w-4 h-4" />
                 </div>
                 <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-white/[0.05] bg-[#0a0a0a]">
                    <div className="flex items-center justify-between mb-1">
                       <span className="font-semibold text-white text-[13px]">Alice Smith</span>
                       <span className="text-[11px] text-neutral-500">Just now</span>
                    </div>
                    <div className="text-[13px] text-neutral-400">Created a new expense: <span className="text-white">AWS Hosting (-₹14,500)</span></div>
                 </div>
              </div>

               {/* Event 2 */}
               <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                 <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/[0.1] bg-[#000000] text-neutral-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 shadow">
                    <User className="w-4 h-4" />
                 </div>
                 <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-white/[0.05] bg-[#0a0a0a]">
                    <div className="flex items-center justify-between mb-1">
                       <span className="font-semibold text-white text-[13px]">John Doe</span>
                       <span className="text-[11px] text-neutral-500">2 hrs ago</span>
                    </div>
                    <div className="text-[13px] text-neutral-400">Deleted transaction <span className="text-white">#TX-9482</span></div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
