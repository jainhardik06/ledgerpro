/**
 * One-time (idempotent) backfill for Discovery Dashboard collections that
 * were provisioned with indexes but never actually populated:
 *   - blog_posts       (only had the 1 auto-generated post; missing the 4
 *                        hand-written launch posts)
 *   - docs_pages       (0 docs registered despite 10 real doc pages existing)
 *   - keyword_targets  (0 rows despite 20 topics with real primary keywords)
 *   - ad_units         (0 rows — the ad slots that exist in code were never
 *                        represented as dashboard-visible records)
 *
 * Reads real content from the filesystem (frontmatter) rather than
 * fabricating anything. Safe to re-run — every write is an upsert.
 *
 * Usage: node scripts/backfill-dashboard-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { connect, PROJECT_ROOT } from './lib/growth.mjs';

async function backfillBlogPosts(db) {
  const dir = path.join(PROJECT_ROOT, 'src', 'content', 'blog');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));
  let n = 0;
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, '');
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { data } = matter(raw);
    await db.collection('blog_posts').updateOne(
      { slug },
      {
        $set: {
          slug,
          title: data.title,
          category: data.category,
          primaryKeyword: Array.isArray(data.keywords) ? data.keywords[0] : null,
          status: data.status ?? 'published',
          published_at: data.publishDate ? new Date(data.publishDate) : new Date(),
          source: data.author === 'Money OS Team' && n < 4 ? 'manual' : 'content-engine',
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );
    n++;
  }
  console.log(`  ✓ blog_posts: ${n} registered`);
}

async function backfillDocsPages(db) {
  const dir = path.join(PROJECT_ROOT, 'src', 'content', 'docs');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mdx'));
  let n = 0;
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, '');
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { data } = matter(raw);
    await db.collection('docs_pages').updateOne(
      { slug },
      {
        $set: {
          slug,
          title: data.title,
          category: data.category ?? null,
          sidebarPosition: data.sidebarPosition ?? null,
          status: data.status ?? 'published',
          url: `https://discovermoneyos.webasthetic.in/docs/${slug}`,
          updated_at: data.updatedDate ? new Date(data.updatedDate) : new Date(data.publishDate),
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );
    n++;
  }
  console.log(`  ✓ docs_pages: ${n} registered`);
}

async function backfillKeywordTargets(db) {
  const topics = await db.collection('content_topics').find({}).toArray();
  let n = 0;
  for (const t of topics) {
    if (!t.primaryKeyword) continue;
    await db.collection('keyword_targets').updateOne(
      { keyword: t.primaryKeyword },
      {
        $set: {
          keyword: t.primaryKeyword,
          category: t.category ?? null,
          searchVolume: t.searchVolume ?? null,
          difficulty: t.difficulty ?? null,
          // Honest state: we have no real rank data yet (no GSC connection
          // to this domain configured). null, not fabricated.
          currentRank: null,
          targetUrl: t.slug ? `https://discovermoneyos.webasthetic.in/blog/${t.slug}` : null,
          status: t.status ?? 'queued',
        },
        $setOnInsert: { created_at: new Date() },
      },
      { upsert: true },
    );
    n++;
  }
  console.log(`  ✓ keyword_targets: ${n} registered`);
}

async function backfillAdUnits(db) {
  // Mirrors the real ad slots implemented in src/components/AdSlot.astro and
  // src/components/InContentAd.astro. isActive is false for every unit
  // because PUBLIC_ADSENSE_CLIENT / PUBLIC_CARBON_SERVE are intentionally
  // unset — this is the infrastructure existing, not ads running.
  const units = [
    {
      unitId: 'blog-in-content',
      name: 'Blog in-content unit',
      placement: 'blog-post',
      position: 'after-3rd-paragraph',
      network: 'adsense',
      isActive: false,
      maxPerPage: 1,
    },
    {
      unitId: 'blog-sidebar',
      name: 'Blog sidebar unit',
      placement: 'blog-post',
      position: 'sidebar-desktop-only',
      network: 'carbon-or-adsense',
      isActive: false,
      maxPerPage: 1,
    },
    {
      unitId: 'resource-footer',
      name: 'Resource page footer unit',
      placement: 'resource-page',
      position: 'after-content',
      network: 'adsense',
      isActive: false,
      maxPerPage: 1,
    },
    {
      unitId: 'comparison-footer',
      name: 'Comparison page footer unit',
      placement: 'comparison-page',
      position: 'after-content',
      network: 'adsense',
      isActive: false,
      maxPerPage: 1,
    },
  ];
  let n = 0;
  for (const u of units) {
    await db.collection('ad_units').updateOne(
      { unitId: u.unitId },
      { $set: u, $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    n++;
  }
  console.log(`  ✓ ad_units: ${n} registered (all inactive — no keys configured)`);
}

async function main() {
  const { client, db } = await connect();
  try {
    console.log('Backfilling Discovery Dashboard collections from real content...');
    await backfillBlogPosts(db);
    await backfillDocsPages(db);
    await backfillKeywordTargets(db);
    await backfillAdUnits(db);
    console.log('Done.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
