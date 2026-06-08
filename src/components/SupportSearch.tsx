"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, FileText, BookOpen, HelpCircle, History, Sparkles, X, CornerDownLeft } from 'lucide-react';
import { DOCS_ARTICLES, SUPPORT_GUIDES, SUPPORT_FAQS, SupportArticle, SupportGuide, SupportFAQ } from '@/lib/supportData';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: 'docs' | 'guide' | 'faq';
  url: string;
}

export function SupportSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('moneyos_recent_searches');
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle auto-focus
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fuzzy search matching logic
  const results = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    const cleanQuery = query.toLowerCase();
    const matches: SearchResult[] = [];

    // Search Docs
    DOCS_ARTICLES.forEach(doc => {
      if (doc.title.toLowerCase().includes(cleanQuery) || doc.description.toLowerCase().includes(cleanQuery) || doc.content.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: doc.id,
          title: doc.title,
          description: doc.description,
          type: 'docs',
          url: `/docs?id=${doc.id}`
        });
      }
    });

    // Search Guides
    SUPPORT_GUIDES.forEach(guide => {
      if (guide.title.toLowerCase().includes(cleanQuery) || guide.description.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: guide.id,
          title: guide.title,
          description: guide.description,
          type: 'guide',
          url: `/guides?id=${guide.id}`
        });
      }
    });

    // Search FAQs
    SUPPORT_FAQS.forEach(faq => {
      if (faq.question.toLowerCase().includes(cleanQuery) || faq.answer.toLowerCase().includes(cleanQuery)) {
        matches.push({
          id: faq.id,
          title: faq.question,
          description: faq.answer,
          type: 'faq',
          url: `/faq?id=${faq.id}`
        });
      }
    });

    return matches.slice(0, 8);
  }, [query]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          navigate(results[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  function navigate(result: SearchResult) {
    // Add to recents
    const nextRecents = [query.trim() || result.title, ...recent.filter(r => r !== (query.trim() || result.title))].slice(0, 4);
    setRecent(nextRecents);
    localStorage.setItem('moneyos_recent_searches', JSON.stringify(nextRecents));

    onClose();
    router.push(result.url);
  }

  const handleRecentClick = (text: string) => {
    setQuery(text);
    setSelectedIndex(0);
  };

  const clearRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecent([]);
    localStorage.removeItem('moneyos_recent_searches');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#000000]/70 backdrop-blur-md" onClick={onClose} />

      {/* Search Container */}
      <div className="relative w-full max-w-xl bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[450px]">
        {/* Header Input */}
        <div className="flex items-center px-4 border-b border-white/[0.05] h-12 shrink-0">
          <Search className="w-4 h-4 text-neutral-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search docs, guides, FAQs..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent border-0 outline-none text-[13px] text-white placeholder-neutral-500 py-2 h-full"
          />
          {query && (
            <button onClick={() => { setQuery(''); setSelectedIndex(0); }} className="p-1 text-neutral-500 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] bg-white/[0.05] text-neutral-400 border border-white/[0.08] px-1.5 py-0.5 rounded ml-2 font-mono">
            ESC
          </span>
        </div>

        {/* Scrollable Results Area */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Default suggestion screen (Empty query) */}
          {!query && (
            <div className="p-3 space-y-4">
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Recent Searches</span>
                    <button onClick={clearRecent} className="hover:text-white transition-colors capitalize">Clear</button>
                  </div>
                  <div className="space-y-1">
                    {recent.map((text, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRecentClick(text)}
                        className="w-full flex items-center justify-between text-[13px] text-neutral-400 hover:text-white hover:bg-white/[0.03] px-3 py-1.5 rounded-md transition-colors text-left"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Popular Searches
                </h4>
                <div className="flex flex-wrap gap-2">
                  {['Double-Entry', 'Invite Team', 'Budget Thresholds', 'Reports & CSV'].map((term) => (
                    <button
                      key={term}
                      onClick={() => { setQuery(term); setSelectedIndex(0); }}
                      className="px-2.5 py-1 text-[12px] bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.1] text-neutral-300 hover:text-white rounded-md transition-all font-medium"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active query results */}
          {query && results.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                Search Results ({results.length})
              </div>
              {results.map((res, index) => {
                const Icon = res.type === 'docs' ? FileText : res.type === 'guide' ? BookOpen : HelpCircle;
                return (
                  <button
                    key={res.id}
                    onClick={() => navigate(res)}
                    className={`w-full flex items-start gap-3 p-2.5 rounded-lg text-left transition-all ${
                      index === selectedIndex ? 'bg-white/[0.05] border border-white/[0.08]' : 'border border-transparent'
                    }`}
                  >
                    <div className="w-7 h-7 rounded bg-white/[0.03] flex items-center justify-center shrink-0 border border-white/[0.05] mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-white truncate">{res.title}</span>
                        <span className="text-[10px] text-neutral-500 capitalize shrink-0 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.05]">
                          {res.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-0.5">{res.description}</p>
                    </div>
                    {index === selectedIndex && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-neutral-500 shrink-0 self-center" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty search matches state */}
          {query && results.length === 0 && (
            <div className="p-8 text-center flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-3">
                <HelpCircle className="w-5 h-5 text-neutral-500" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-1">No articles found for "{query}"</h3>
              <p className="text-[12px] text-neutral-400 max-w-[280px] mb-4">
                Try searching for general terms like "budget", "teams", or "isolation".
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setQuery('getting started'); setSelectedIndex(0); }}
                  className="px-2.5 py-1 text-[11px] bg-white/[0.03] border border-white/[0.05] text-neutral-300 rounded hover:bg-white/[0.08] transition-colors"
                >
                  Getting Started
                </button>
                <Link href="/contact-support" onClick={onClose} className="px-2.5 py-1 text-[11px] bg-white text-black rounded hover:bg-neutral-200 transition-colors font-medium">
                  Ask Support
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
