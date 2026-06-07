import React from 'react';
import Link from 'next/link';
import { Search, Book, MessageSquare, Mail, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function SupportPage() {
  return (
    <div className="flex flex-col items-center pb-24">
      {/* Header */}
      <section className="w-full pt-32 pb-16 px-6 bg-[#000000] border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-white mb-6 animate-in">How can we help?</h1>
          <div className="relative animate-in" style={{ animationDelay: '100ms' }}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
            <Input 
              type="text" 
              placeholder="Search documentation, guides, and FAQs..." 
              className="w-full h-14 pl-12 bg-[#0a0a0a] border-white/[0.1] text-white text-[15px] focus-visible:ring-white/[0.2] rounded-xl shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="w-full py-16 px-6 max-w-5xl mx-auto">
        <h2 className="text-[13px] font-semibold text-neutral-500 uppercase tracking-widest mb-8 text-center">Quick Categories</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Link href="/docs/getting-started" className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
            <Book className="w-6 h-6 text-neutral-400 group-hover:text-white mb-4 transition-colors" />
            <h3 className="text-lg font-medium text-white mb-2">Getting Started</h3>
            <p className="text-[14px] text-neutral-400">Learn how to set up your workspace, invite your team, and log your first transaction.</p>
          </Link>
          <Link href="/docs/billing" className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
            <MessageSquare className="w-6 h-6 text-neutral-400 group-hover:text-white mb-4 transition-colors" />
            <h3 className="text-lg font-medium text-white mb-2">Billing & Plans</h3>
            <p className="text-[14px] text-neutral-400">Manage your subscription, view invoices, and understand workspace limits.</p>
          </Link>
          <Link href="/docs/security" className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
            <AlertTriangle className="w-6 h-6 text-neutral-400 group-hover:text-white mb-4 transition-colors" />
            <h3 className="text-lg font-medium text-white mb-2">Security & Access</h3>
            <p className="text-[14px] text-neutral-400">Configure roles, review audit logs, and manage tenant-level permissions.</p>
          </Link>
        </div>
      </section>

      {/* Contact Support */}
      <section className="w-full px-6 max-w-3xl mx-auto text-center mt-12 border-t border-white/[0.05] pt-16">
        <h2 className="text-2xl font-semibold text-white mb-4">Still need help?</h2>
        <p className="text-neutral-400 mb-8">Our support team is available Monday through Friday, 9am - 6pm EST.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/contact">
            <Button className="bg-white text-black hover:bg-neutral-200">
              <Mail className="w-4 h-4 mr-2" /> Email Support
            </Button>
          </Link>
          <Link href="/status">
            <Button variant="outline" className="border-white/[0.1] text-white">Check System Status</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
