import React from 'react';
import Link from 'next/link';
import { GraduationCap, ShieldAlert, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function StudentClubsUseCase() {
  return (
    <div className="flex flex-col w-full pb-24">
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[12px] font-medium text-indigo-400 mb-8">
            Money OS for Student Clubs
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Treasury management for the next generation.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            Say goodbye to inherited, broken Excel sheets. Ensure absolute accountability with immutable audit logs and easy hand-offs for the next semester's board.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
             <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Create Club Workspace</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <ShieldAlert className="w-6 h-6 text-indigo-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Immutable Logs</h3>
              <p className="text-[14px] text-neutral-400">Total transparency. Every expense logged by a board member is permanently recorded, eliminating disputes.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <GraduationCap className="w-6 h-6 text-indigo-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Easy Hand-offs</h3>
              <p className="text-[14px] text-neutral-400">When you graduate, simply provision Admin access to the new Treasurer. No more migrating messy Google Sheets.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Users className="w-6 h-6 text-indigo-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Sponsor Tracking</h3>
              <p className="text-[14px] text-neutral-400">Toggle "Student Club" mode in settings to automatically relabel the app. Track sponsor funds easily.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
