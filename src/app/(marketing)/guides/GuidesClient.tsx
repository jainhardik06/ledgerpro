"use client";

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Play, BookOpen, Users, Compass, ArrowLeft, ArrowRight, Check,
  Target, GraduationCap, Briefcase, UserCheck, RefreshCw 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SUPPORT_GUIDES, SupportGuide } from '@/lib/supportData';

function GuidesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('id');

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const selectedGuide = activeId ? SUPPORT_GUIDES.find(g => g.id === activeId) || null : null;
  const safeStepIdx = selectedGuide ? Math.min(currentStepIdx, selectedGuide.steps.length - 1) : 0;

  // Filter categories
  const categories = ['All', 'Freelancer Guides', 'Agency Guides', 'Student Club Guides', 'Small Business Guides'];

  const filteredGuides = activeCategory === 'All'
    ? SUPPORT_GUIDES
    : SUPPORT_GUIDES.filter(g => g.category === activeCategory);

  const selectGuide = (guide: SupportGuide) => {
    setCurrentStepIdx(0);
    router.push(`/guides?id=${guide.id}`);
  };

  const clearGuideSelection = () => {
    setCurrentStepIdx(0);
    router.push('/guides');
  };

  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-5xl mx-auto">
        
        {/* Header Section */}
        {!selectedGuide ? (
          <>
            <div className="mb-12">
              <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-6 font-mono">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight text-white mb-3">Guides & Tutorials</h1>
              <p className="text-[14px] text-neutral-400">Step-by-step illustrations tailored to help you launch and manage your specific organization ledger.</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-10 pb-4 border-b border-white/[0.05]">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    activeCategory === cat 
                      ? 'bg-white text-black' 
                      : 'bg-white/[0.03] border border-white/[0.05] text-neutral-400 hover:text-white'
                  }`}
                >
                  {cat === 'All' ? 'All Guides' : cat.replace(' Guides', '')}
                </button>
              ))}
            </div>

            {/* Grid of Guides */}
            <div className="grid md:grid-cols-2 gap-6">
              {filteredGuides.map(guide => {
                const Icon = guide.category === 'Freelancer Guides' 
                  ? Briefcase 
                  : guide.category === 'Agency Guides' 
                    ? Users 
                    : guide.category === 'Student Club Guides'
                      ? GraduationCap
                      : Compass;
                return (
                  <div 
                    key={guide.id}
                    onClick={() => selectGuide(guide)}
                    className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.01] hover:border-white/[0.1] transition-all cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-4 group-hover:border-white/[0.1] transition-all">
                        <Icon className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors mb-2">{guide.title}</h3>
                      <p className="text-[13px] text-neutral-400 leading-relaxed mb-6">{guide.description}</p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono border-t border-white/[0.05] pt-4">
                      <span>Target: {guide.audience}</span>
                      <span className="flex items-center gap-1 text-white group-hover:text-emerald-400 font-semibold transition-colors">
                        View Steps <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Active Guide Step-by-Step Wizard view */
          <div className="max-w-3xl mx-auto">
            <button 
              onClick={clearGuideSelection}
              className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8 font-mono"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Guides Index
            </button>

            {/* Guide Title Header */}
            <div className="mb-8 pb-6 border-b border-white/[0.05]">
              <span className="text-[11px] bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded font-mono text-neutral-400 uppercase">
                {selectedGuide.category}
              </span>
              <h1 className="text-3xl font-semibold tracking-tight text-white mt-3 mb-2">{selectedGuide.title}</h1>
              <p className="text-[14px] text-neutral-400 font-medium flex items-center gap-1.5">
                <Target className="w-4 h-4 text-neutral-500" /> Target Audience: <span className="text-neutral-200">{selectedGuide.audience}</span>
              </p>
            </div>

            {/* Step Wizard Container */}
            <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-2xl mb-8">
              {/* Horizontal steps timeline bar */}
              <div className="flex items-center justify-between gap-2 mb-8 relative">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/[0.05] -translate-y-1/2 -z-10" />
                {selectedGuide.steps.map((step, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentStepIdx(idx)}
                    className={`w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-mono font-bold transition-all relative z-10 ${
                      idx === safeStepIdx
                        ? 'bg-white text-black border-white scale-110 shadow-lg'
                        : idx < safeStepIdx
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-500/30'
                          : 'bg-black text-neutral-500 border-white/[0.05] hover:border-white/[0.12] hover:text-white'
                    }`}
                  >
                    {idx < safeStepIdx ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </button>
                ))}
              </div>

              {/* Step detail panel */}
              <div className="min-h-[160px] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Step {safeStepIdx + 1} of {selectedGuide.steps.length}</span>
                  <h3 className="text-lg font-semibold text-white mt-1 mb-3">{selectedGuide.steps[safeStepIdx].title}</h3>
                  <p className="text-[13.5px] text-neutral-300 leading-relaxed">{selectedGuide.steps[safeStepIdx].description}</p>
                </div>

                {/* Navigation inside step wizard */}
                <div className="flex justify-between gap-4 mt-8 pt-4 border-t border-white/[0.05]">
                  <button
                    disabled={safeStepIdx === 0}
                    onClick={() => setCurrentStepIdx(prev => prev - 1)}
                    className="px-3 py-1.5 rounded bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] text-[12px] text-neutral-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Previous Step
                  </button>

                  {safeStepIdx < selectedGuide.steps.length - 1 ? (
                    <button
                      onClick={() => setCurrentStepIdx(prev => prev + 1)}
                      className="px-4 py-1.5 rounded bg-white text-black hover:bg-neutral-200 text-[12px] font-semibold transition-colors flex items-center gap-1.5"
                    >
                      Next Step <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={clearGuideSelection}
                      className="px-4 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-400 text-[12px] font-semibold transition-colors flex items-center gap-1.5"
                    >
                      Complete Guide <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default function GuidesClient() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-neutral-500"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Guides...</div>}>
      <GuidesContent />
    </Suspense>
  );
}
