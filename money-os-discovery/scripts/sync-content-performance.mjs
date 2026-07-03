/**
 * Content Performance — pulls REAL pageview counts per blog post from
 * PostHog (same project the discovery site reports pageviews to via
 * PUBLIC_POSTHOG_KEY) using PostHog's HogQL query API.
 *
 * Deliberately does NOT fabricate metrics we have no real data source for
 * (CTR, average search position, conversions, signups, "revenue
 * attribution") — those would need Search Console access (not granted yet)
 * and a real attribution pipeline between this site and product signups
 * (doesn't exist). Views is the one number we can report honestly today.
 *
 * Usage: node scripts/sync-content-performance.mjs
 */
import { connect } from './lib/growth.mjs';

const POSTHOG_HOST = process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

async function queryPageviews() {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) return { ok: false, reason: 'no_credentials' };

  // HogQL: pageview count grouped by path, for our blog paths, last 90 days.
  const query = {
    query: {
      kind: 'HogQLQuery',
      query: `
        SELECT properties.$pathname AS path, count() AS views
        FROM events
        WHERE event = '$pageview'
          AND properties.$pathname LIKE '/blog/%'
          AND timestamp >= now() - INTERVAL 90 DAY
        GROUP BY path
        ORDER BY views DESC
      `,
    },
  };

  const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, reason: `http_${res.status}: ${body.slice(0, 200)}` };
  }

  const data = await res.json();
  // results: [[path, views], ...]
  const rows = (data.results ?? []).map(([path, views]) => ({ path, views }));
  return { ok: true, rows };
}

function slugFromPath(path) {
  const match = path.match(/^\/blog\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

async function main() {
  console.log('Pulling real pageview data from PostHog (last 90 days)...');
  const result = await queryPageviews();

  if (!result.ok) {
    console.log(`! PostHog query failed (non-fatal): ${result.reason}`);
    console.log('  Nothing was overwritten in the Growth DB — existing view counts, if any, are untouched.');
    return;
  }

  const { client, db } = await connect();
  try {
    let updated = 0;
    for (const row of result.rows) {
      const slug = slugFromPath(row.path);
      if (!slug) continue;
      await db.collection('blog_posts').updateOne(
        { slug },
        { $set: { pageviews_90d: row.views, pageviews_synced_at: new Date() } },
      );
      console.log(`  ${slug}: ${row.views} views`);
      updated++;
    }
    console.log(`\n✓ Synced real pageview counts for ${updated} post(s) from PostHog.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Content performance sync failed:', err.message);
  process.exit(1);
});
