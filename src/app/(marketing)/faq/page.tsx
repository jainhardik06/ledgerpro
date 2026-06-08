"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  HelpCircle, Search, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, 
  ArrowLeft, MessageSquare, ArrowRight, RefreshCw 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SUPPORT_FAQS, SupportFAQ } from '@/lib/supportData';

function FaqContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('id');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [votedFaqs, setVotedFaqs] = useState<Record<string, boolean>>({});

  const categories = ['All', 'Account', 'Transactions', 'Teams', 'Security', 'Reports'];

  // Handle query parameter for deep linking to specific FAQs
  useEffect(() => {
    if (activeId) {
      setExpandedFaq(activeId);
      const matchedFaq = SUPPORT_FAQS.find(f => f.id === activeId);
      if (matchedFaq) {
        setActiveCategory('All');
      }
    }
  }, [activeId]);

  // Fuzzy filter list of FAQs
  const filteredFaqs = SUPPORT_FAQS.filter(faq => {
    const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleFaq = (id: string) => {
    setExpandedFaq(prev => (prev === id ? null : id));
  };

  const voteFaq = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVotedFaqs(prev => ({ ...prev, [id]: true }));
  };

  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-3xl mx-auto">
        
        {/* Back Link */}
        <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-6 font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
        </Link>

        {/* Title */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2 flex items-center gap-2">
            <HelpCircle className="w-6.5 h-6.5 text-amber-400" /> Frequently Asked Questions
          </h1>
          <p className="text-[14px] text-neutral-400">Search or filter through common inquiries regarding workspace ledgers, operations, and permissions.</p>
        </div>

        {/* Search Input */}
        <div className="relative mb-8">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Search questions and answers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-[#0a0a0a] border border-white/[0.08] focus:border-white/[0.2] outline-none text-[13px] text-white rounded-lg transition-colors placeholder-neutral-500"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 pb-4 border-b border-white/[0.05]">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setExpandedFaq(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                activeCategory === cat 
                  ? 'bg-white text-black' 
                  : 'bg-white/[0.03] border border-white/[0.05] text-neutral-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="space-y-4">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map(faq => {
              const isExpanded = expandedFaq === faq.id;
              const hasVoted = !!votedFaqs[faq.id];
              return (
                <div 
                  key={faq.id}
                  onClick={() => toggleFaq(faq.id)}
                  className={`border rounded-xl transition-all cursor-pointer overflow-hidden ${
                    isExpanded 
                      ? 'border-white/[0.12] bg-[#0a0a0a]' 
                      : 'border-white/[0.05] bg-white/[0.01] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="p-4 flex items-center justify-between gap-4">
                    <span className="text-[14px] font-semibold text-white">{faq.question}</span>
                    <span className="text-neutral-500 shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-white/[0.05] text-[13px] text-neutral-300 leading-relaxed space-y-4">
                      <p>{faq.answer}</p>
                      
                      {/* Helpfulness check */}
                      <div className="flex items-center justify-between pt-4 border-t border-white/[0.03] text-[11px] text-neutral-500">
                        <span>Category: <strong className="text-neutral-300 font-medium">{faq.category}</strong></span>
                        <div className="flex items-center gap-2">
                          <span>Was this helpful?</span>
                          {hasVoted ? (
                            <span className="text-emerald-400 animate-pulse font-medium">Thank you!</span>
                          ) : (
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => voteFaq(faq.id, e)}
                                className="p-1 hover:text-white transition-colors border border-white/[0.05] rounded hover:bg-white/[0.03]"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={(e) => voteFaq(faq.id, e)}
                                className="p-1 hover:text-white transition-colors border border-white/[0.05] rounded hover:bg-white/[0.03]"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Empty State */
            <div className="p-12 text-center flex flex-col items-center border border-white/[0.05] rounded-xl bg-[#0a0a0a]">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
                <HelpCircle className="w-5 h-5 text-neutral-500" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-1">No FAQs match "{searchQuery}"</h3>
              <p className="text-[12px] text-neutral-400 max-w-[280px] mb-4">
                Try adjusting your search criteria or choosing a different category tab.
              </p>
              <button 
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="px-3 py-1.5 bg-white text-black text-[12px] font-medium rounded hover:bg-neutral-200 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          )}
        </div>

        {/* Support CTA */}
        <div className="mt-16 p-8 rounded-xl border border-white/[0.05] bg-white/[0.01] flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-lg font-semibold text-white mb-1">Still need more clarity?</h4>
            <p className="text-[13px] text-neutral-400">Our engineering support team is happy to assist with your ledger setup.</p>
          </div>
          <Link href="/contact-support">
            <Button className="bg-white text-black hover:bg-neutral-200 text-[12px] font-medium h-9 px-4 shrink-0 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Contact Support <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

      </main>
    </div>
  );
}

export default function FAQPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-neutral-500"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading FAQ Portal...</div>}>
      <FaqContent />
    </Suspense>
  );
}
