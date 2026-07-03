import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog | Money OS',
  description: 'Practical finance guides for freelancers, agencies, startups, and small teams — expense tracking, budgeting, taxes, and tools.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog | Money OS',
    description: 'Practical finance guides for freelancers, agencies, startups, and small teams.',
    url: '/blog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog | Money OS',
    description: 'Practical finance guides for freelancers, agencies, startups, and small teams.',
  },
};

interface DiscoveryPost {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  category: string | null;
}

/**
 * The real blog lives at discover.moneyos.webasthetic.in — a separate Astro
 * site with the actual content engine, OG images, and full article layout.
 * This page used to show hand-written fake placeholder posts with dead
 * links; instead it now server-fetches the discovery site's real RSS feed
 * and renders genuine posts, linking out to the full articles. Revalidates
 * hourly so a newly-published post appears without a redeploy.
 */
// Custom domain first (correct long-term URL); Vercel's own domain as a
// fallback since discover.moneyos.webasthetic.in isn't DNS-configured yet
// as of this writing — without this, the page silently shows nothing until
// DNS is set up. Once DNS is live, the first URL succeeds and this is moot.
const DISCOVERY_RSS_URLS = [
  'https://discover.moneyos.webasthetic.in/rss.xml',
  'https://money-os-discovery.vercel.app/rss.xml',
];

async function getDiscoveryPosts(): Promise<DiscoveryPost[]> {
  let xml: string | null = null;

  for (const url of DISCOVERY_RSS_URLS) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (res.ok) {
        xml = await res.text();
        break;
      }
    } catch {
      // try the next candidate
    }
  }

  if (!xml) return [];

  try {
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    return items.map((m) => {
      const block = m[1];
      const field = (tag: string) => {
        const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
      };
      const categoryMatch = block.match(/<category>([\s\S]*?)<\/category>/);
      return {
        title: field('title'),
        link: field('link'),
        description: field('description'),
        pubDate: field('pubDate'),
        category: categoryMatch ? categoryMatch[1] : null,
      };
    });
  } catch {
    return [];
  }
}

function formatDate(pubDate: string) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function BlogPage() {
  const posts = await getDiscoveryPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="flex flex-col w-full pb-24 min-h-screen">
      <section className="w-full pt-24 sm:pt-32 pb-12 sm:pb-16 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">Blog</h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Practical finance guides for freelancers, agencies, and small teams — no fluff, no filler.
          </p>
        </div>
      </section>

      <section className="w-full py-12 sm:py-16 px-4 sm:px-6 max-w-4xl mx-auto">
        {posts.length === 0 ? (
          <div className="p-8 rounded-2xl border border-white/[0.05] bg-[#0a0a0a] text-center">
            <p className="text-[15px] text-neutral-400">The blog is temporarily unavailable. Read it directly at{' '}
              <a href="https://discover.moneyos.webasthetic.in/blog" className="text-white underline underline-offset-2">
                discover.moneyos.webasthetic.in/blog
              </a>.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {featured && (
              <a
                href={featured.link}
                className="sm:col-span-2 group block p-8 rounded-2xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    {featured.category && (
                      <span className="text-[12px] font-medium text-emerald-400 uppercase tracking-widest">{featured.category}</span>
                    )}
                    <span className="text-[12px] text-neutral-500">{formatDate(featured.pubDate)}</span>
                  </div>
                  <h2 className="text-2xl font-semibold text-white mb-3 group-hover:text-emerald-400 transition-colors">{featured.title}</h2>
                  <p className="text-[15px] text-neutral-400 max-w-2xl">{featured.description}</p>
                </div>
              </a>
            )}

            {rest.map((post) => (
              <a key={post.link} href={post.link} className="group block p-6 rounded-xl border border-white/[0.05] bg-[#000000] hover:bg-[#0a0a0a] transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  {post.category && (
                    <span className="text-[12px] font-medium text-neutral-300 uppercase tracking-widest">{post.category}</span>
                  )}
                  <span className="text-[12px] text-neutral-500">{formatDate(post.pubDate)}</span>
                </div>
                <h2 className="text-lg font-medium text-white mb-2 group-hover:text-emerald-400 transition-colors">{post.title}</h2>
                <p className="text-[14px] text-neutral-400">{post.description}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
