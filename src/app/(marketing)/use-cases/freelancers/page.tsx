import React from 'react';
import Link from 'next/link';
import { UserCircle, Coffee, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function FreelancersUseCase() {
  return (
    <div className="flex flex-col w-full pb-24">
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 relative border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/10 via-[#000000] to-[#000000] -z-10" />
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[12px] font-medium text-amber-400 mb-8">
            Money OS for Freelancers
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-semibold tracking-tight text-white mb-6 animate-in" style={{ animationDelay: '100ms' }}>
            Tax season, simplified.
          </h1>
          <p className="text-lg text-neutral-400 font-medium max-w-2xl mx-auto mb-10 animate-in" style={{ animationDelay: '200ms' }}>
            As a freelancer, your time is your inventory. Stop wasting it on messy spreadsheets. Track income, categorize expenses instantly, and know exactly what you owe.
          </p>
          <div className="flex items-center gap-4 animate-in" style={{ animationDelay: '300ms' }}>
            <Link href="/login">
              <Button className="bg-white text-black hover:bg-neutral-200">Start Free Workspace</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="w-full py-16 sm:py-24 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <Coffee className="w-6 h-6 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Built for one</h3>
              <p className="text-[14px] text-neutral-400">Our Free tier has everything a solo operator needs. Track up to 100 transactions a month without ever paying a dime.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <FileSpreadsheet className="w-6 h-6 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Export to Accountant</h3>
              <p className="text-[14px] text-neutral-400">When tax season arrives, generate a clean, formatted XLSX export in one click. Your CPA will love you.</p>
           </div>
           <div className="rounded-2xl border border-white/[0.05] bg-[#0a0a0a] p-8 shadow-2xl">
              <UserCircle className="w-6 h-6 text-amber-500 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Client Tracking</h3>
              <p className="text-[14px] text-neutral-400">Tag income to specific clients. Instantly see which retainer is driving your highest margin.</p>
           </div>
        </div>
      </section>
    </div>
  );
}
