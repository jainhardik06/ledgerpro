/**
 * Reports internal-link suggestions for EXISTING content — human-review
 * only, does not edit any files (see internal-links.mjs docstring for why).
 * Stores suggestions in the Growth DB so they're visible from the
 * Discovery Dashboard too.
 *
 * Usage: node scripts/suggest-internal-links.mjs
 */
import { loadAllContent, findRelated } from './lib/internal-links.mjs';
import { connect } from './lib/growth.mjs';

async function main() {
  const all = loadAllContent();
  console.log(`Scanning ${all.length} content pieces for internal-link opportunities...\n`);

  const { client, db } = await connect();
  try {
    for (const piece of all) {
      const related = findRelated(piece, all, 3);
      if (related.length === 0) continue;

      console.log(`${piece.type}/${piece.slug}`);
      for (const r of related) {
        console.log(`  -> ${r.url}  (score ${r.score}, ${r.type}/${r.slug})`);
      }

      await db.collection('seo_pages').updateOne(
        { url: { $regex: `${piece.slug}$` } },
        { $set: { suggested_links: related.map((r) => ({ url: r.url, title: r.title, score: r.score })), links_checked_at: new Date() } },
      );
    }
    console.log('\n✓ Suggestions recorded in Growth DB (seo_pages.suggested_links).');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Internal link suggestion failed:', err.message);
  process.exit(1);
});
