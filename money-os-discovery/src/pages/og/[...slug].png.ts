import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderOgImage } from '../../lib/og';
import { useCases } from '../../data/use-cases';

/**
 * Build-time Open Graph image factory.
 *
 * Enumerates every content entry + the site default and prerenders a unique
 * 1200×630 PNG to `/og/<section>/<slug>.png`. Referenced by Layout.astro and
 * every page-specific `ogImage`. Because these are static files, social/AI
 * previews cost nothing to serve and scale to any traffic level.
 */
export async function getStaticPaths() {
  const [docs, blog, comparisons, resources] = await Promise.all([
    getCollection('docs', ({ data }) => data.status === 'published'),
    getCollection('blog', ({ data }) => data.status === 'published'),
    getCollection('comparisons', ({ data }) => data.status === 'published'),
    getCollection('resources', ({ data }) => data.status === 'published'),
  ]);

  const paths: Array<{ params: { slug: string }; props: { title: string; eyebrow: string } }> = [];

  // Site default + homepage
  paths.push({ params: { slug: 'default' }, props: { title: 'The financial command center for serious operators.', eyebrow: 'Money OS' } });

  for (const d of docs) paths.push({ params: { slug: `docs/${d.id}` }, props: { title: d.data.title, eyebrow: 'Documentation' } });

  // Standalone programmatic use-case pages (from the manifest, not a collection).
  for (const u of useCases) paths.push({ params: { slug: `use-cases/${u.slug}` }, props: { title: u.ogTitle, eyebrow: 'Use Case' } });
  for (const c of comparisons) paths.push({ params: { slug: `comparisons/${c.id}` }, props: { title: c.data.title, eyebrow: 'Comparison' } });
  for (const r of resources) paths.push({ params: { slug: `resources/${r.id}` }, props: { title: r.data.title, eyebrow: 'Resource' } });
  for (const b of blog) paths.push({ params: { slug: `blog/${b.id}` }, props: { title: b.data.title, eyebrow: 'Blog' } });

  return paths;
}

export const GET: APIRoute = async ({ props }) => {
  const { title, eyebrow } = props as { title: string; eyebrow: string };
  const png = await renderOgImage({ title, eyebrow });
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
