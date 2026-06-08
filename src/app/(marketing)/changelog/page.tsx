"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Clock, Search, ArrowLeft, ArrowRight, Zap, RefreshCcw, CheckCircle2, AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CHANGELOGS, ChangelogEntry } from '@/lib/supportData';

export default function ChangelogPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter changelogs by query
  const filteredChangelogs = CHANGELOGS.filter(log => {
    const matchesSearch = log.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.added.some(item => item.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          log.improved.some(item => item.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          log.fixed.some(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="w-full pt-32 pb-24 px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-4xl mx-auto">
        
        {/* Back Link */}
        <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8 font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-white/[0.05]">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2 flex items-center gap-2">
              <Clock className="w-6.5 h-6.5 text-cyan-400" /> Platform Changelog
            </h1>
            <p className="text-[14px] text-neutral-400">Regular release updates, improvements, and system patches for Money OS.</p>
          </div>
          
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search updates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-[#0a0a0a] border border-white/[0.08] focus:border-white/[0.2] outline-none text-[12px] text-white rounded-lg transition-colors placeholder-neutral-500"
            />
          </div>
        </div>

        {/* Dynamic Changelog Logs */}
        <div className="space-y-16">
          {filteredChangelogs.length > 0 ? (
            filteredChangelogs.map((log, index) => (
              <article key={log.version} className="grid md:grid-cols-4 gap-8">
                
                {/* Version & Date Column */}
                <div className="md:col-span-1 md:sticky md:top-24 h-fit space-y-1">
                  <span className="text-2xl font-bold tracking-tight text-white font-mono">{log.version}</span>
                  <div className="text-[12px] text-neutral-500 font-mono">{log.date}</div>
                  <div className="pt-4 hidden md:block">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                      Production Release
                    </span>
                  </div>
                </div>

                {/* Log Details Column */}
                <div className="md:col-span-3 space-y-6">
                  <h3 className="text-xl font-semibold text-white tracking-tight">{log.title}</h3>

                  {/* Added list */}
                  {log.added.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-400" /> New Features
                      </h4>
                      <ul className="space-y-2 pl-5">
                        {log.added.map((item, idx) => (
                          <li key={idx} className="text-[13px] text-neutral-300 leading-relaxed list-disc">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improved list */}
                  {log.improved.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                        <RefreshCcw className="w-3.5 h-3.5 text-indigo-400" /> Improvements
                      </h4>
                      <ul className="space-y-2 pl-5">
                        {log.improved.map((item, idx) => (
                          <li key={idx} className="text-[13px] text-neutral-300 leading-relaxed list-disc">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Fixed list */}
                  {log.fixed.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" /> Bug Fixes
                      </h4>
                      <ul className="space-y-2 pl-5">
                        {log.fixed.map((item, idx) => (
                          <li key={idx} className="text-[13px] text-neutral-300 leading-relaxed list-disc">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </article>
            ))
          ) : (
            /* Empty state */
            <div className="p-12 text-center flex flex-col items-center border border-white/[0.05] rounded-xl bg-[#0a0a0a]">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
                <AlertOctagon className="w-5 h-5 text-neutral-500" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-1">No updates match "{searchQuery}"</h3>
              <p className="text-[12px] text-neutral-400 max-w-[280px]">
                Try adjusting your search criteria or looking for general terms.
              </p>
            </div>
          )}
        </div>

        {/* Upcoming Section */}
        <section className="mt-20 pt-12 border-t border-white/[0.05]">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6">Upcoming Roadmap</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-2">
              <span className="text-[10px] font-mono text-cyan-400">Scheduled for Q3</span>
              <h4 className="text-[14px] font-semibold text-white">Advanced Custom Automations</h4>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                Connect external accounts via secure server webhooks to automate daily ledger entries and reconcile transactions.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-white/[0.05] bg-white/[0.01] space-y-2">
              <span className="text-[10px] font-mono text-cyan-400">Under Design Review</span>
              <h4 className="text-[14px] font-semibold text-white">Granular Team Permission Matrices</h4>
              <p className="text-[12px] text-neutral-400 leading-relaxed">
                Create role boundaries down to specific transaction accounts and custom spending categories.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
