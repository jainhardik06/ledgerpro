"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Book, Search, ChevronRight, ArrowLeft, ArrowRight, 
  ThumbsUp, ThumbsDown, Copy, Check, Calendar, User, Clock, FileText, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SupportSearch } from '@/components/SupportSearch';
import { DOCS_ARTICLES, SupportArticle } from '@/lib/supportData';

function DocsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('id') || 'introduction';

  const [activeArticle, setActiveArticle] = useState<SupportArticle>(DOCS_ARTICLES[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [voted, setVoted] = useState<boolean | null>(null);

  // Synchronize active article with URL query param
  useEffect(() => {
    const article = DOCS_ARTICLES.find(a => a.id === activeId) || DOCS_ARTICLES[0];
    setActiveArticle(article);
    setVoted(null);
  }, [activeId]);

  // Copy link handler
  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Generate Table of Contents by parsing h2/h3 tags from markdown
  const getTocHeaders = (content: string) => {
    const lines = content.split('\n');
    const headers: { text: string; id: string }[] = [];
    lines.forEach(line => {
      if (line.startsWith('## ')) {
        const text = line.replace('## ', '').trim();
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        headers.push({ text, id });
      }
    });
    return headers;
  };

  const toc = getTocHeaders(activeArticle.content);

  // Pagination navigation
  const currentIndex = DOCS_ARTICLES.findIndex(a => a.id === activeArticle.id);
  const prevArticle = currentIndex > 0 ? DOCS_ARTICLES[currentIndex - 1] : null;
  const nextArticle = currentIndex < DOCS_ARTICLES.length - 1 ? DOCS_ARTICLES[currentIndex + 1] : null;

  // Render basic custom Markdown styling to keep turbopack/next.js clean
  const renderMarkdown = (markdown: string) => {
    const lines = markdown.split('\n');
    let insideCodeBlock = false;
    let codeContent: string[] = [];

    return lines.map((line, idx) => {
      if (line.startsWith('```')) {
        insideCodeBlock = !insideCodeBlock;
        if (!insideCodeBlock) {
          const content = codeContent.join('\n');
          codeContent = [];
          return (
            <pre key={idx} className="bg-white/[0.02] border border-white/[0.08] p-4 rounded-lg font-mono text-[12px] text-neutral-300 my-4 overflow-x-auto">
              <code>{content}</code>
            </pre>
          );
        }
        return null;
      }

      if (insideCodeBlock) {
        codeContent.push(line);
        return null;
      }

      if (line.startsWith('## ')) {
        const text = line.replace('## ', '').trim();
        const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return (
          <h2 key={idx} id={id} className="text-lg font-semibold text-white mt-8 mb-4 border-b border-white/[0.05] pb-2 group flex items-center justify-between">
            {text}
            <a href={`#${id}`} className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-opacity pl-2">#</a>
          </h2>
        );
      }

      if (line.startsWith('* ')) {
        return (
          <li key={idx} className="text-[13px] text-neutral-300 ml-5 list-disc my-1.5 leading-relaxed">
            {line.replace('* ', '')}
          </li>
        );
      }

      if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ') || line.startsWith('4. ') || line.startsWith('5. ') || line.startsWith('6. ')) {
        return (
          <li key={idx} className="text-[13px] text-neutral-300 ml-5 list-decimal my-1.5 leading-relaxed">
            {line.substring(3)}
          </li>
        );
      }

      if (line.trim() === '') {
        return <div key={idx} className="h-2" />;
      }

      // Check if bold spans exist
      return (
        <p key={idx} className="text-[13.5px] text-neutral-300 my-3 leading-relaxed">
          {line.split('**').map((chunk, i) => i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{chunk}</strong> : chunk)}
        </p>
      );
    });
  };

  // Group documentation sidebar categories
  const categories: Record<string, SupportArticle[]> = {};
  DOCS_ARTICLES.forEach(doc => {
    if (!categories[doc.category]) {
      categories[doc.category] = [];
    }
    categories[doc.category].push(doc);
  });

  return (
    <div className="w-full pt-14 bg-[#000000] text-white min-h-screen flex flex-col">
      {/* Global Search Overlay */}
      <SupportSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Docs Shell */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 flex flex-col md:flex-row gap-8 py-8 relative">
        
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-64 shrink-0 md:sticky md:top-24 md:h-[calc(100vh-8rem)] overflow-y-auto pr-4 border-r border-white/[0.05] space-y-6">
          
          {/* Quick Search Button */}
          <button 
            onClick={() => setSearchOpen(true)}
            className="w-full h-9 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] px-3 flex items-center justify-between text-neutral-500 hover:text-neutral-300 transition-all text-left text-[12px]"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              Quick search...
            </span>
            <span className="text-[9px] bg-white/[0.05] border border-white/[0.08] px-1 py-0.2 rounded font-mono text-neutral-400">
              ⌘K
            </span>
          </button>

          {/* Directory Listings */}
          <div className="space-y-4">
            {Object.keys(categories).map(catName => (
              <div key={catName}>
                <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest px-2.5 mb-2">{catName}</h4>
                <div className="flex flex-col gap-0.5">
                  {categories[catName].map(doc => (
                    <Link
                      key={doc.id}
                      href={`/docs?id=${doc.id}`}
                      className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all flex items-center justify-between ${
                        doc.id === activeArticle.id 
                          ? 'bg-white/[0.05] text-white border-l-2 border-emerald-400' 
                          : 'text-neutral-400 hover:text-white hover:bg-white/[0.02]'
                      }`}
                    >
                      {doc.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <hr className="border-white/[0.05]" />

          {/* Fallbacks */}
          <div className="px-2.5 space-y-3">
            <Link href="/contact-support" className="flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors">
              <Clock className="w-3.5 h-3.5" /> Ask Support Engineers
            </Link>
          </div>
        </aside>

        {/* Central Article Column */}
        <main className="flex-1 min-w-0 max-w-3xl py-2">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mb-6 font-mono">
            <Link href="/support" className="hover:text-white transition-colors">Support</Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-neutral-300 truncate">{activeArticle.category}</span>
          </div>

          {/* Header metadata */}
          <div className="mb-8 pb-6 border-b border-white/[0.05]">
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-3">{activeArticle.title}</h1>
            <p className="text-[15px] text-neutral-400 mb-6 font-medium leading-relaxed">{activeArticle.description}</p>
            
            <div className="flex flex-wrap items-center gap-6 text-[12px] text-neutral-500 font-mono">
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Money OS Support</span>
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {activeArticle.readTime} read</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Updated {activeArticle.lastUpdated}</span>
              <button 
                onClick={handleCopyLink} 
                className="flex items-center gap-1.5 hover:text-white transition-colors ml-auto border border-white/[0.05] bg-white/[0.02] px-2 py-0.5 rounded"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied Link' : 'Copy Link'}
              </button>
            </div>
          </div>

          {/* Render parsed contents */}
          <article className="prose prose-invert prose-neutral max-w-none">
            {renderMarkdown(activeArticle.content)}
          </article>

          {/* Helpfulness voting */}
          <div className="mt-16 p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex items-center justify-between gap-6 shadow-xl">
            <span className="text-[13px] font-medium text-neutral-300">Was this article helpful?</span>
            <div className="flex gap-2">
              {voted === null ? (
                <>
                  <button 
                    onClick={() => setVoted(true)} 
                    className="h-8 w-14 rounded border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] flex items-center justify-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-[11px]"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" /> Yes
                  </button>
                  <button 
                    onClick={() => setVoted(false)} 
                    className="h-8 w-14 rounded border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] flex items-center justify-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-[11px]"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" /> No
                  </button>
                </>
              ) : (
                <span className="text-[12px] font-medium text-emerald-400 animate-pulse">Thank you for your feedback!</span>
              )}
            </div>
          </div>

          {/* Next & Previous Buttons */}
          <div className="mt-12 pt-8 border-t border-white/[0.05] flex justify-between gap-4">
            {prevArticle ? (
              <Link href={`/docs?id=${prevArticle.id}`} className="flex-1 max-w-[240px]">
                <button className="w-full p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.01] transition-all text-left group flex items-start gap-3">
                  <ArrowLeft className="w-4 h-4 text-neutral-500 group-hover:-translate-x-1 transition-transform mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Previous</span>
                    <p className="text-[13px] font-medium text-white truncate mt-0.5">{prevArticle.title}</p>
                  </div>
                </button>
              </Link>
            ) : (
              <div />
            )}

            {nextArticle ? (
              <Link href={`/docs?id=${nextArticle.id}`} className="flex-1 max-w-[240px] text-right ml-auto">
                <button className="w-full p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.01] transition-all text-right group flex items-start justify-end gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] text-neutral-500 font-mono uppercase">Next</span>
                    <p className="text-[13px] font-medium text-white truncate mt-0.5">{nextArticle.title}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:translate-x-1 transition-transform mt-0.5 shrink-0" />
                </button>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </main>

        {/* Right Sticky Table of Contents Column */}
        {toc.length > 0 && (
          <aside className="hidden lg:block w-48 shrink-0 sticky top-24 h-[calc(100vh-8rem)] overflow-y-auto pl-4 border-l border-white/[0.05]">
            <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">On this page</h4>
            <nav className="flex flex-col gap-2">
              {toc.map(header => (
                <a 
                  key={header.id} 
                  href={`#${header.id}`}
                  className="text-[12px] text-neutral-400 hover:text-white transition-colors py-0.5 leading-snug truncate"
                >
                  {header.text}
                </a>
              ))}
            </nav>
          </aside>
        )}

      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-neutral-500"><RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading Documentation...</div>}>
      <DocsContent />
    </Suspense>
  );
}
