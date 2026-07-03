import React from 'react';
import Link from 'next/link';
import { Users, ArrowRight, ShieldCheck, UserPlus, Key } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Multi-Player Finance | Money OS',
  description: 'Invite your team to Money OS with role-based access — Admin, Member, or Viewer — and a complete audit trail for every change.',
  alternates: { canonical: '/features/teams' },
  openGraph: { title: 'Multi-Player Finance | Money OS', description: 'Role-based team access with a complete audit trail for every change.', url: '/features/teams', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Multi-Player Finance | Money OS', description: 'Role-based team access with a complete audit trail for every change.' },
};

export default function TeamsFeature() {
  return (
    <div className="flex flex-col w-full pb-24">
      {/* Hero */}
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 animate-in">
            <Users className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Multi-player finance.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Invite your team, assign strict roles, and collaborate on your organization's ledger without compromising security.
          </p>
          <div className="flex flex-col items-center gap-2 animate-in" style={{ animationDelay: '300ms' }}>
            <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Start your workspace</Button>
            </Link>
            <span className="text-[12px] text-neutral-500 font-mono">100% Free during Beta</span>
          </div>
        </div>
      </section>

      {/* Abstract UI Showcase */}
      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-white/[0.1] bg-[#0a0a0a] p-8 shadow-2xl relative overflow-hidden flex flex-col md:flex-row gap-8">
           <div className="flex-1 space-y-4">
              <h3 className="text-[13px] text-neutral-500 font-medium uppercase tracking-widest border-b border-white/[0.05] pb-2">Active Users</h3>
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#000000] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-white">JD</div>
                  <div className="text-[13px] font-medium text-white">John Doe</div>
                </div>
                <div className="px-2 py-0.5 rounded text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20">Admin</div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-[#000000] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-[11px] font-bold text-white">AS</div>
                  <div className="text-[13px] font-medium text-white">Alice Smith</div>
                </div>
                <div className="px-2 py-0.5 rounded text-[11px] bg-white/[0.05] text-neutral-300 border border-white/[0.05]">User</div>
              </div>
           </div>

           <div className="w-px bg-white/[0.05] hidden md:block" />

           <div className="flex-1 flex items-center justify-center p-8 text-center border border-white/[0.05] border-dashed rounded-lg bg-[#000000]/50">
             <div>
               <UserPlus className="w-8 h-8 text-neutral-600 mx-auto mb-4" />
               <p className="text-[13px] text-neutral-400 mb-4">Invite members directly via email. Define exactly what they can see and do.</p>
               <Button variant="outline" size="sm" className="border-white/[0.1] text-white">Invite Member</Button>
             </div>
           </div>
        </div>
      </section>

      {/* Grid */}
      <section className="w-full py-16 px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="space-y-4">
             <ShieldCheck className="w-6 h-6 text-white" />
             <h3 className="text-lg font-semibold text-white">Strict Isolation</h3>
             <p className="text-[14px] text-neutral-400">Data is isolated at the tenant level. Team members can never access data outside your organization.</p>
           </div>
           <div className="space-y-4">
             <Key className="w-6 h-6 text-white" />
             <h3 className="text-lg font-semibold text-white">Role-Based Access</h3>
             <p className="text-[14px] text-neutral-400">Assign Admin privileges for full control, or User privileges for simple data entry workflows.</p>
           </div>
           <div className="space-y-4">
             <Users className="w-6 h-6 text-white" />
             <h3 className="text-lg font-semibold text-white">Shared Accountability</h3>
             <p className="text-[14px] text-neutral-400">Every transaction is tagged with the user who logged it, ensuring total transparency across your team.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
