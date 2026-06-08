import React from 'react';
import Link from 'next/link';

export default function BlogPage() {
  const posts = [
    {
      title: "Why we abandoned Tailwind gradients for strict monochrome",
      date: "October 14, 2026",
      category: "Design",
      excerpt: "Financial software shouldn't look like a Web3 landing page. Here is our philosophy on data density and tabular-nums."
    },
    {
      title: "The engineering behind zero-latency transactions",
      date: "September 28, 2026",
      category: "Engineering",
      excerpt: "How we architected our MongoDB schema and Next.js server actions to achieve <100ms P99 write latencies."
    },
    {
      title: "Introducing Money OS for Agencies",
      date: "August 12, 2026",
      category: "Product",
      excerpt: "Managing client retainers just got 10x easier. Announcing our new Multi-tenant project budgeting features."
    }
  ];

  return (
    <div className="flex flex-col w-full pb-24 min-h-screen">
      <section className="w-full pt-24 sm:pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">Blog</h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Thoughts on design, engineering, and building a sustainable business.
          </p>
        </div>
      </section>

      <section className="w-full py-12 sm:py-16 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-6">
          {/* Featured Post */}
          <Link href="/blog/redesign" className="sm:col-span-2 group block p-8 rounded-2xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[12px] font-medium text-emerald-400 uppercase tracking-widest">Engineering</span>
                <span className="text-[12px] text-neutral-500">October 24, 2026</span>
              </div>
              <h2 className="text-2xl font-semibold text-white mb-3 group-hover:text-emerald-400 transition-colors">How we built mathematically proven tenant isolation.</h2>
              <p className="text-[15px] text-neutral-400 max-w-2xl">B2B SaaS requires absolute trust. We detail our exact strategy for preventing cross-tenant data leaks at the database query level.</p>
            </div>
          </Link>

          {/* Standard Posts */}
          {posts.map((post, i) => (
             <Link key={i} href="#" className="group block p-6 rounded-xl border border-white/[0.05] bg-[#000000] hover:bg-[#0a0a0a] transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[12px] font-medium text-neutral-300 uppercase tracking-widest">{post.category}</span>
                <span className="text-[12px] text-neutral-500">{post.date}</span>
              </div>
              <h2 className="text-lg font-medium text-white mb-2">{post.title}</h2>
              <p className="text-[14px] text-neutral-400">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
