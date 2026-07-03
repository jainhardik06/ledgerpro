"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, Book, Shield, HelpCircle, Mail, Play, Sparkles, 
  ArrowRight, Clock, ArrowUpRight 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SupportSearch } from '@/components/SupportSearch';
import { DOCS_ARTICLES, SUPPORT_FAQS } from '@/lib/supportData';

export default function SupportClient() {
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
    <div className="flex flex-col w-full pb-24 bg-[#000000] text-white min-h-screen">
      <SupportSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── Hero ── */}
      <section className="w-full pt-28 pb-14 px-4 sm:px-6 relative overflow-hidden border-b border-white/[0.05]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/30 via-[#000000] to-[#000000] -z-10" />

        <div className="max-w-2xl mx-auto text-center flex flex-col items-center">
          {/* Status Badge */}
          <Link
            href="/status"
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400 mb-6 hover:bg-emerald-500/15 transition-all min-h-[32px]"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            All systems operational
          </Link>

          <h1 className="text-3xl sm:text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tighter text-white mb-4 leading-[1.15]">
            How can we help?
          </h1>
          <p className="text-neutral-400 max-w-sm sm:max-w-xl mb-8 text-[14px] sm:text-[15px] font-medium leading-relaxed px-2">
            Search our guides, technical docs, and FAQs — or open a conversation with our support team.
          </p>

          {/* Search trigger — full-width, no overflow */}
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full min-h-[48px] rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.12] px-4 flex items-center justify-between text-neutral-500 hover:text-neutral-300 transition-all text-left group"
            aria-label="Open search"
          >
            <span className="flex items-center gap-3 text-[13px] truncate">
              <Search className="w-4 h-4 text-neutral-400 shrink-0 group-hover:text-neutral-300 transition-colors" />
              <span className="truncate">Search docs, guides, updates...</span>
            </span>
            {mounted && (
              <span className="text-[10px] bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono text-neutral-400 shrink-0 ml-2">
                {navigator.platform.indexOf('Mac') > -1 ? '⌘K' : 'Ctrl+K'}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* ── Main Grid ── */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-10">

          {/* Left: Quick Navigation */}
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3 px-1">
                Support Channels
              </h3>
              <nav className="flex flex-col gap-0.5">
                {[
                  { href: '/support/getting-started', icon: Sparkles, label: 'Getting Started', color: 'text-emerald-400' },
                  { href: '/docs', icon: Book, label: 'Documentation', color: 'text-blue-400' },
                  { href: '/guides', icon: Play, label: 'Guides & Tutorials', color: 'text-purple-400' },
                  { href: '/security', icon: Shield, label: 'Security Center', color: 'text-rose-400' },
                  { href: '/faq', icon: HelpCircle, label: 'FAQs Portal', color: 'text-amber-400' },
                  { href: '/changelog', icon: Clock, label: 'Changelog', color: 'text-cyan-400' },
                ].map(({ href, icon: Icon, label, color }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.03] transition-all min-h-[44px]"
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${color}`} />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <hr className="border-white/[0.05]" />

            {/* Quick Contact */}
            <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01]">
              <h4 className="text-[12px] font-semibold text-white mb-2 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> Need developer help?
              </h4>
              <p className="text-[11px] text-neutral-400 mb-4 leading-relaxed">
                Our support team answers complex questions with 1-on-1 assistance.
              </p>
              <Link href="/contact-support" className="w-full block">
                <Button size="sm" className="w-full bg-white text-black hover:bg-neutral-200 text-[11px] h-9 font-medium">
                  Submit Support Ticket
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: Content Grid */}
          <div className="lg:col-span-3 space-y-10">

            {/* Category Cards */}
            <div>
              <h2 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-5">
                Core Support Categories
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {[
                  { href: '/support/getting-started', icon: Sparkles, color: 'text-emerald-400', title: 'Getting Started', desc: 'Setup your organization ledger and invite team members.' },
                  { href: '/docs', icon: Book, color: 'text-blue-400', title: 'Documentation', desc: 'Read technical papers about double-entry structures and tenant keys.' },
                  { href: '/security', icon: Shield, color: 'text-rose-400', title: 'Security Hub', desc: 'Understand database isolation standards and role audits.' },
                ].map(({ href, icon: Icon, color, title, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="p-4 sm:p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors group"
                  >
                    <Icon className={`w-5 h-5 ${color} mb-3`} />
                    <h4 className={`text-[13px] sm:text-[14px] font-medium text-white group-hover:${color} transition-colors flex items-center gap-1.5`}>
                      {title}
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                    </h4>
                    <p className="text-[12px] text-neutral-400 mt-2 leading-relaxed">{desc}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Popular Articles + FAQs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">
                  Popular Articles
                </h3>
                <div className="space-y-2.5">
                  {DOCS_ARTICLES.slice(0, 3).map(article => (
                    <Link
                      key={article.id}
                      href={`/docs?id=${article.id}`}
                      className="block p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] hover:bg-white/[0.01] transition-all group min-h-[56px]"
                    >
                      <div className="text-[13px] font-medium text-neutral-200 group-hover:text-white flex items-start justify-between gap-2">
                        <span className="leading-snug">{article.title}</span>
                        <ArrowUpRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0 mt-0.5" />
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-1">{article.description}</p>
                    </Link>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">
                  Trending FAQs
                </h3>
                <div className="space-y-2.5">
                  {SUPPORT_FAQS.slice(0, 3).map(faq => (
                    <Link
                      key={faq.id}
                      href={`/faq?id=${faq.id}`}
                      className="block p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] hover:bg-white/[0.01] transition-all group min-h-[56px]"
                    >
                      <div className="text-[13px] font-medium text-neutral-200 group-hover:text-white flex items-start justify-between gap-2">
                        <span className="leading-snug">{faq.question}</span>
                        <ArrowUpRight className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0 mt-0.5" />
                      </div>
                      <p className="text-[11px] text-neutral-400 truncate mt-1">{faq.answer}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Newsletter CTA — stacks on mobile */}
            <div className="p-6 sm:p-8 rounded-xl border border-white/[0.05] bg-[#0a0a0a] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
              <div className="relative flex flex-col gap-5">
                <div>
                  <h4 className="text-base sm:text-lg font-semibold text-white mb-1.5">Subscribe to Product Updates</h4>
                  <p className="text-[13px] text-neutral-400">Receive summaries of new changelogs, features, and security reports. No spam.</p>
                </div>

                {subscribed ? (
                  <div className="text-[13px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-lg font-mono">
                    Subscription active! Thank you.
                  </div>
                ) : (
                  <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                    {/* Always stacked — row only on sm+ */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        required
                        placeholder="you@domain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-black border border-white/[0.1] rounded-lg px-3 py-2.5 text-[13px] text-white outline-none focus:border-white/[0.3] w-full min-h-[44px]"
                      />
                      <Button
                        type="submit"
                        disabled={subscribing}
                        size="sm"
                        className="bg-white text-black hover:bg-neutral-200 text-[12px] h-11 sm:h-auto sm:min-h-[44px] px-5 shrink-0 font-medium w-full sm:w-auto"
                      >
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

          </div>
        </div>
      </section>
    </div>
  );
}
