import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

/**
 * /rss.xml — blog feed for readers, aggregators, and AI ingestion. Built from
 * published blog posts, newest first. Regenerated every build.
 */
export async function GET(context: APIContext) {
  const posts = await getCollection('blog', ({ data }) => data.status === 'published');
  posts.sort((a, b) => +b.data.publishDate - +a.data.publishDate);

  return rss({
    title: 'Money OS Blog',
    description:
      'Practical finance guides for freelancers, agencies, startups, and small teams — expense tracking, budgeting, taxes, and tools.',
    site: context.site ?? 'https://discovermoneyos.webasthetic.in',
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: `/blog/${post.id}/`,
      categories: post.data.keywords ?? (post.data.category ? [post.data.category] : []),
    })),
    customData: `<language>en-us</language>`,
  });
}
