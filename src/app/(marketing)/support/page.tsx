"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, Book, Shield, HelpCircle, Mail, MessageSquare, Play, Sparkles, 
  ArrowRight, ShieldCheck, Zap, Activity, Clock, Users, ArrowUpRight 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SupportSearch } from '@/components/SupportSearch';
import { DOCS_ARTICLES, SUPPORT_FAQS } from '@/lib/supportData';

export default function SupportPage() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribing(true);
    setSubscribeError('');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setSubscribed(true);
        setEmail('');
      } else {
        const data = await res.json();
        setSubscribeError(data.error || 'Failed to subscribe.');
      }
    } catch (err) {
      setSubscribeError('Network error. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="flex flex-col items-center pb-24 bg-[#000000] text-white min-h-screen">
      {/* Search Overlay */}
      <SupportSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Hero Section */}
      <section className="w-full pt-32 pb-16 px-6 relative overflow-hidden border-b border-white/[0.05]">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/30 via-[#000000] to-[#000000] -z-10" />
        
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          {/* Status Badge */}
          <Link href="/status" className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400 mb-8 hover:bg-emerald-500/15 transition-all">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            All systems operational
          </Link>

          <h1 className="text-4xl md:text-5xl font-semibold tracking-tighter text-white mb-6 leading-[1.15]">
            How can we help you today?
          </h1>
          <p className="text-neutral-400 max-w-xl mb-8 text-[15px] font-medium">
            Search our guides, technical documentations, and FAQs, or open a conversation with our support engineering team.
          </p>

          {/* Large Search Trigger */}
          <button 
            onClick={() => setSearchOpen(true)}
            className="w-full max-w-lg h-12 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.12] px-4 flex items-center justify-between text-neutral-500 hover:text-neutral-300 transition-all text-left group shadow-lg"
          >
            <span className="flex items-center gap-3 text-[13px]">
              <Search className="w-4 h-4 text-neutral-400 group-hover:text-neutral-300 transition-colors" />
              Search docs, guides, updates...
            </span>
            <span className="text-[10px] bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono text-neutral-400">
              {mounted && (navigator.platform.indexOf('Mac') > -1 ? '⌘K' : 'Ctrl+K')}
            </span>
          </button>
        </div>
      </section>

      {/* Main Support Grid */}
      <section className="w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-4 gap-8 py-16">
        
        {/* Left Column: Quick Navigation Links & Status */}
        <div className="lg:col-span-1 space-y-8">
          <div>
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Support Channels</h3>
            <nav className="flex flex-col gap-1">
              <Link href="/support/getting-started" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <Sparkles className="w-4 h-4 text-emerald-400" /> Getting Started
              </Link>
              <Link href="/docs" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <Book className="w-4 h-4 text-blue-400" /> Documentation
              </Link>
              <Link href="/guides" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <Play className="w-4 h-4 text-purple-400" /> Guides & Tutorials
              </Link>
              <Link href="/security" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <Shield className="w-4 h-4 text-rose-400" /> Security Center
              </Link>
              <Link href="/faq" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <HelpCircle className="w-4 h-4 text-amber-400" /> FAQs Portal
              </Link>
              <Link href="/changelog" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all">
                <Clock className="w-4 h-4 text-cyan-400" /> Changelog Updates
              </Link>
            </nav>
          </div>

          <hr className="border-white/[0.05]" />

          {/* Quick Contact Box */}
          <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01]">
            <h4 className="text-[12px] font-semibold text-white mb-2 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-neutral-400" /> Need developer help?
            </h4>
            <p className="text-[11px] text-neutral-400 mb-4 leading-relaxed">
              Our support team answers complex questions with 1-on-1 assistance.
            </p>
            <Link href="/contact-support" className="w-full">
              <Button size="sm" className="w-full bg-white text-black hover:bg-neutral-200 text-[11px] h-8 font-medium">
                Submit Support Ticket
              </Button>
            </Link>
          </div>
        </div>

        {/* Right Columns: Dynamic Content Grid */}
        <div className="lg:col-span-3 space-y-12">
          
          {/* Quick Categories Cards */}
          <div>
            <h2 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6">Core Support Categories</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <Link href="/support/getting-started" className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
                <Sparkles className="w-5 h-5 text-emerald-400 mb-3" />
                <h4 className="text-[14px] font-medium text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                  Getting Started <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </h4>
                <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">Setup your organization ledger and invite team members.</p>
              </Link>

              <Link href="/docs" className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
                <Book className="w-5 h-5 text-blue-400 mb-3" />
                <h4 className="text-[14px] font-medium text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                  Documentation <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </h4>
                <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">Read technical papers about double-entry structures and tenant keys.</p>
              </Link>

              <Link href="/security" className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group">
                <Shield className="w-5 h-5 text-rose-400 mb-3" />
                <h4 className="text-[14px] font-medium text-white group-hover:text-rose-400 transition-colors flex items-center gap-1.5">
                  Security Hub <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                </h4>
                <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">Understand database isolation standards and role audits.</p>
              </Link>
            </div>
          </div>

          {/* Popular & Trending Sections split */}
          <div className="grid md:grid-cols-2 gap-8">
            {/* Popular Articles */}
            <div>
              <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Popular Articles</h3>
              <div className="space-y-3">
                {DOCS_ARTICLES.slice(0, 3).map(article => (
                  <Link 
                    key={article.id}
                    href={`/docs?id=${article.id}`}
                    className="block p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] hover:bg-white/[0.01] transition-all group"
                  >
                    <div className="text-[13px] font-medium text-neutral-200 group-hover:text-white flex items-center justify-between">
                      {article.title}
                      <ArrowUpRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-1">{article.description}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Trending FAQs */}
            <div>
              <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Trending FAQs</h3>
              <div className="space-y-3">
                {SUPPORT_FAQS.slice(0, 3).map(faq => (
                  <Link 
                    key={faq.id}
                    href={`/faq?id=${faq.id}`}
                    className="block p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] hover:bg-white/[0.01] transition-all group"
                  >
                    <div className="text-[13px] font-medium text-neutral-200 group-hover:text-white flex items-center justify-between">
                      {faq.question}
                      <ArrowUpRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                    </div>
                    <p className="text-[11px] text-neutral-400 truncate mt-1">{faq.answer}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>


          {/* Newsletter Subscription CTA */}
          <div className="p-8 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="max-w-md">
              <h4 className="text-lg font-semibold text-white mb-1.5">Subscribe to Product Updates</h4>
              <p className="text-[13px] text-neutral-400">Receive summaries of new changelogs, features, and security reports. No spam.</p>
            </div>
            {subscribed ? (
              <div className="text-[13px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-lg font-mono">
                Subscription active! Thank you.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-2 w-full md:w-auto">
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-black border border-white/[0.1] rounded-lg px-3 py-1.5 text-[12px] text-white outline-none focus:border-white/[0.3] flex-1 md:w-48"
                  />
                  <Button type="submit" disabled={subscribing} size="sm" className="bg-white text-black hover:bg-neutral-200 text-[11px] h-8 shrink-0 font-medium">
                    {subscribing ? 'Subscribing...' : 'Subscribe'}
                  </Button>
                </div>
                {subscribeError && (
                  <p className="text-[11px] text-rose-400 font-mono">{subscribeError}</p>
                )}
              </form>
            )}
          </div>

        </div>
      </section>
    </div>
  );
}
