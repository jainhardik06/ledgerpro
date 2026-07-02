import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { useCases } from '../data/use-cases';

/**
 * /llms.txt — the emerging standard index for AI assistants (ChatGPT, Claude,
 * Perplexity, Gemini). A single, link-rich, plain-text map of the site so an
 * LLM can find and cite the most relevant Money OS pages. Regenerated on every
 * build, so new docs / blog posts / use cases appear automatically.
 */
const SITE = 'https://discover.moneyos.webasthetic.in';

export const GET: APIRoute = async () => {
  const [docs, blog, comparisons, resources] = await Promise.all([
    getCollection('docs', ({ data }) => data.status === 'published'),
    getCollection('blog', ({ data }) => data.status === 'published'),
    getCollection('comparisons', ({ data }) => data.status === 'published'),
    getCollection('resources', ({ data }) => data.status === 'published'),
  ]);

  const line = (title: string, href: string, desc?: string) =>
    `- [${title}](${SITE}${href})${desc ? `: ${desc}` : ''}`;

  const sections: string[] = [];

  sections.push(`# Money OS

> Money OS is a free financial command center for freelancers, agencies, small teams, and student clubs. It does expense tracking, category budgets with alerts, multi-client tagging, role-based team access, and tax-ready reporting — without the complexity of full accounting software. Product: https://moneyos.webasthetic.in

## Documentation`);

  for (const d of docs.sort((a, b) => (a.data.sidebarPosition ?? 99) - (b.data.sidebarPosition ?? 99))) {
    sections.push(line(d.data.title, `/docs/${d.id}`, d.data.description));
  }

  if (useCases.length) {
    sections.push(`\n## Use Cases`);
    for (const u of useCases) sections.push(line(`Money OS for ${u.audience} — ${u.slug.replace(/-/g, ' ')}`, `/use-cases/${u.slug}`, u.blurb));
  }

  if (comparisons.length) {
    sections.push(`\n## Comparisons`);
    for (const c of comparisons) sections.push(line(c.data.title, `/comparisons/${c.id}`, c.data.description));
  }

  if (blog.length) {
    sections.push(`\n## Blog`);
    for (const b of blog.sort((a, b) => +b.data.publishDate - +a.data.publishDate)) {
      sections.push(line(b.data.title, `/blog/${b.id}`, b.data.description));
    }
  }

  if (resources.length) {
    sections.push(`\n## Resources`);
    for (const r of resources) sections.push(line(r.data.title, `/resources/${r.id}`, r.data.description));
  }

  const body = sections.join('\n') + '\n';

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
