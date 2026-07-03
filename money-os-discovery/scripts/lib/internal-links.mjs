/**
 * Internal Linking Engine.
 *
 * Scores relatedness between content pieces (blog, docs, use-cases,
 * comparisons) by keyword/category overlap, and surfaces the top matches
 * for a given piece of content.
 *
 * Deliberately does NOT auto-rewrite already-published MDX prose — silently
 * inserting links into existing sentences risks mangling real content
 * (broken markdown, links in the wrong place, awkward phrasing) with no
 * human review. Instead this is used two ways:
 *   1. Feeds real, specific link suggestions into new-post generation
 *      (generate-post.mjs) so the model links to genuinely related pages
 *      instead of guessing from a static hardcoded list in the prompt.
 *   2. `npm run content:link-suggest` reports suggestions for EXISTING
 *      content as a human-review list (console + Growth DB), so adding
 *      links to older posts is a deliberate edit, not a silent mutation.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { PROJECT_ROOT } from './growth.mjs';
import { useCases } from '../../src/data/use-cases.mjs';

function readCollection(dir) {
  const full = path.join(PROJECT_ROOT, 'src', 'content', dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => {
      const slug = f.replace(/\.mdx$/, '');
      const { data } = matter(fs.readFileSync(path.join(full, f), 'utf8'));
      return {
        type: dir,
        slug,
        title: data.title,
        keywords: (data.keywords ?? []).map((k) => k.toLowerCase()),
        category: (data.category ?? '').toLowerCase(),
        url: `/${dir}/${slug}`,
      };
    });
}

/** Every linkable piece of content on the site, normalized to one shape. */
export function loadAllContent() {
  const blog = readCollection('blog');
  const docs = readCollection('docs');
  const comparisons = readCollection('comparisons');
  const resources = readCollection('resources');
  const useCaseEntries = useCases.map((u) => ({
    type: 'use-cases',
    slug: u.slug,
    title: u.ogTitle,
    keywords: [u.audience.toLowerCase(), u.slug.replace(/-/g, ' ')],
    category: u.group.toLowerCase(),
    url: `/use-cases/${u.slug}`,
  }));
  return [...blog, ...docs, ...comparisons, ...resources, ...useCaseEntries];
}

function overlapScore(a, b) {
  if (a.slug === b.slug && a.type === b.type) return -1; // never suggest linking to self
  let score = 0;
  const aKeywords = new Set(a.keywords);
  for (const kw of b.keywords) {
    if (aKeywords.has(kw)) score += 2;
    // partial word overlap (e.g. "freelance budget" vs "freelance tax")
    else if ([...aKeywords].some((k) => k.split(' ').some((w) => kw.includes(w) && w.length > 4))) score += 1;
  }
  if (a.category && a.category === b.category) score += 1;
  return score;
}

/**
 * Return the top N most-related pieces of content to `target`, scored by
 * keyword/category overlap. Excludes the target itself.
 */
export function findRelated(target, allContent, limit = 5) {
  return allContent
    .map((c) => ({ ...c, score: overlapScore(target, c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
