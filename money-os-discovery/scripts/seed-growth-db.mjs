/**
 * Seed / provision the Growth Database.
 *
 * Idempotent: safe to run repeatedly. Creates all 23 collections, their
 * indexes (including TTL indexes that keep the Atlas Free tier under its 512 MB
 * limit), and seeds the operational data the ecosystem needs to function:
 *   - content_topics  (the content engine's queue, from topic-backlog.json)
 *   - affiliate_links (partner redirects served by /go/<slug>)
 *   - seo_pages       (inventory of every static page, for the dashboard)
 *   - directories     (starter directory submission targets)
 *   - social_profiles (canonical handles)
 *
 * Usage: npm run growth:seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, PROJECT_ROOT } from './lib/growth.mjs';
import { useCasesSeed } from './data/seo-seed.mjs';

const ALL_COLLECTIONS = [
  'directories', 'directory_submissions', 'backlinks', 'referring_domains',
  'social_profiles', 'social_assets', 'seo_pages', 'blog_posts', 'docs_pages',
  'content_topics', 'content_briefs', 'keyword_targets', 'crawler_visits',
  'growth_metrics', 'launch_campaigns', 'product_hunt_assets', 'ad_units',
  'ad_placements', 'ad_performance', 'affiliate_links', 'affiliate_clicks',
  'affiliate_conversions', 'content_performance',
];

async function ensureCollections(db) {
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of ALL_COLLECTIONS) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`  + created collection: ${name}`);
    }
  }
}

async function ensureIndexes(db) {
  // Uniqueness / lookup
  await db.collection('affiliate_links').createIndex({ slug: 1 }, { unique: true });
  await db.collection('blog_posts').createIndex({ slug: 1 }, { unique: true });
  await db.collection('docs_pages').createIndex({ slug: 1 }, { unique: true });
  await db.collection('seo_pages').createIndex({ url: 1 }, { unique: true });
  await db.collection('directories').createIndex({ name: 1 }, { unique: true });
  await db.collection('content_topics').createIndex({ primaryKeyword: 1 }, { unique: true });
  await db.collection('content_topics').createIndex({ status: 1, priority: -1 });
  await db.collection('keyword_targets').createIndex({ keyword: 1 }, { unique: true });
  await db.collection('referring_domains').createIndex({ domain: 1 }, { unique: true });
  await db.collection('social_profiles').createIndex({ platform: 1 }, { unique: true });

  // TTL indexes — automatic pruning to respect Atlas Free 512 MB.
  await db.collection('crawler_visits').createIndex({ visited_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });   // 90d
  await db.collection('affiliate_clicks').createIndex({ clicked_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }); // 180d

  // Time-series reads
  await db.collection('growth_metrics').createIndex({ date: -1 });
  await db.collection('content_performance').createIndex({ slug: 1, date: -1 });
  console.log('  ✓ indexes ensured');
}

async function upsertMany(db, collection, docs, key) {
  let n = 0;
  for (const doc of docs) {
    await db.collection(collection).updateOne(
      { [key]: doc[key] },
      { $set: doc, $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    n++;
  }
  console.log(`  ✓ ${collection}: ${n} upserted`);
}

async function seedContentTopics(db) {
  const file = path.join(PROJECT_ROOT, 'scripts', 'data', 'topic-backlog.json');
  const backlog = JSON.parse(fs.readFileSync(file, 'utf8'));
  const docs = backlog.map((t) => ({ ...t, status: 'queued', source: 'backlog' }));
  await upsertMany(db, 'content_topics', docs, 'primaryKeyword');
}

async function seedAffiliateLinks(db) {
  const now = new Date();
  const links = [
    { slug: 'wise', partner: 'Wise', target_url: 'https://wise.com/', category: 'banking', active: true, recommended_for: 'International payments & FX', added_at: now },
    { slug: 'bonsai', partner: 'Bonsai', target_url: 'https://www.hellobonsai.com/', category: 'freelance-suite', active: true, recommended_for: 'Freelance contracts & invoicing', added_at: now },
    { slug: 'honeybook', partner: 'HoneyBook', target_url: 'https://www.honeybook.com/', category: 'client-management', active: true, recommended_for: 'Client management for creatives', added_at: now },
    { slug: 'mercury', partner: 'Mercury', target_url: 'https://mercury.com/', category: 'banking', active: true, recommended_for: 'Startup business banking', added_at: now },
    { slug: 'quickbooks', partner: 'QuickBooks', target_url: 'https://quickbooks.intuit.com/', category: 'accounting', active: true, recommended_for: 'Full accounting when you outgrow tracking', added_at: now },
    { slug: 'wave', partner: 'Wave', target_url: 'https://www.waveapps.com/', category: 'accounting', active: true, recommended_for: 'Free invoicing + bookkeeping', added_at: now },
    { slug: 'expensify', partner: 'Expensify', target_url: 'https://www.expensify.com/', category: 'expense', active: true, recommended_for: 'Receipt scanning at company scale', added_at: now },
  ];
  await upsertMany(db, 'affiliate_links', links, 'slug');
}

async function seedDirectories(db) {
  const dirs = [
    { name: 'Product Hunt', url: 'https://www.producthunt.com/', authority: 91, tier: 1, status: 'planned' },
    { name: 'G2', url: 'https://www.g2.com/', authority: 90, tier: 1, status: 'planned' },
    { name: 'Capterra', url: 'https://www.capterra.com/', authority: 88, tier: 1, status: 'planned' },
    { name: 'AlternativeTo', url: 'https://alternativeto.net/', authority: 84, tier: 1, status: 'planned' },
    { name: 'SaaSHub', url: 'https://www.saashub.com/', authority: 72, tier: 2, status: 'planned' },
    { name: 'Indie Hackers', url: 'https://www.indiehackers.com/', authority: 79, tier: 2, status: 'planned' },
    { name: 'BetaList', url: 'https://betalist.com/', authority: 70, tier: 2, status: 'planned' },
    { name: 'Slant', url: 'https://www.slant.co/', authority: 73, tier: 2, status: 'planned' },
  ];
  await upsertMany(db, 'directories', dirs, 'name');
}

async function seedSocialProfiles(db) {
  const profiles = [
    { platform: 'twitter', handle: '@moneyos', url: 'https://twitter.com/moneyos', status: 'planned' },
    { platform: 'indiehackers', handle: 'moneyos', url: 'https://www.indiehackers.com/product/money-os', status: 'planned' },
    { platform: 'producthunt', handle: 'money-os', url: 'https://www.producthunt.com/products/money-os', status: 'planned' },
  ];
  await upsertMany(db, 'social_profiles', profiles, 'platform');
}

async function seedSeoPages(db) {
  await upsertMany(db, 'seo_pages', useCasesSeed(), 'url');
}

async function main() {
  const { client, db } = await connect();
  try {
    console.log(`Seeding Growth DB: ${db.databaseName}`);
    await ensureCollections(db);
    await ensureIndexes(db);
    await seedContentTopics(db);
    await seedAffiliateLinks(db);
    await seedDirectories(db);
    await seedSocialProfiles(db);
    await seedSeoPages(db);
    console.log('Done. Growth DB is provisioned and seeded.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
