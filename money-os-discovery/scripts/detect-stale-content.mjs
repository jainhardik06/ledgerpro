/**
 * Content Refresh — detection only (not an AI-rewrite pipeline; that would
 * be a much bigger, separate decision). Flags blog posts whose publishDate
 * is older than the staleness threshold so they show up for manual review
 * in the Discovery Dashboard, and un-flags posts that have since been
 * updated (updatedDate is recent).
 *
 * Real, simple, useful: no fabricated "health score" or "ranking score" —
 * we don't have real per-post ranking data to compute those honestly (that
 * needs Search Console access, which isn't granted yet). Once GSC access
 * exists, this can be extended with real position/CTR trend data.
 *
 * Usage: node scripts/detect-stale-content.mjs [--months=6]
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { connect, PROJECT_ROOT } from './lib/growth.mjs';

const monthsArg = process.argv.find((a) => a.startsWith('--months='));
const STALE_AFTER_MONTHS = monthsArg ? Number(monthsArg.split('=')[1]) : 6;

async function main() {
  const dir = path.join(PROJECT_ROOT, 'src', 'content', 'blog');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);

  const { client, db } = await connect();
  try {
    let staleCount = 0;
    let freshCount = 0;

    for (const file of files) {
      const slug = file.replace(/\.mdx$/, '');
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data } = matter(raw);

      const effectiveDate = data.updatedDate ? new Date(data.updatedDate) : new Date(data.publishDate);
      const isStale = effectiveDate < cutoff;
      const ageMonths = Math.round((Date.now() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24 * 30));

      await db.collection('blog_posts').updateOne(
        { slug },
        {
          $set: {
            needs_refresh: isStale,
            age_months: ageMonths,
            refresh_checked_at: new Date(),
          },
        },
        { upsert: false },
      );

      if (isStale) {
        staleCount++;
        console.log(`  ⚠ ${slug} — ${ageMonths} months old, flagged for review`);
      } else {
        freshCount++;
      }
    }

    console.log(`\n✓ Checked ${files.length} posts: ${staleCount} flagged stale (>${STALE_AFTER_MONTHS}mo), ${freshCount} still fresh.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Stale content detection failed:', err.message);
  process.exit(1);
});
