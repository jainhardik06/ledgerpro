import type { APIRoute } from 'astro';
import { getGrowthDb } from '../../lib/growth-db';

/**
 * Affiliate redirect handler — /go/<slug>.
 *
 * On-demand (serverless) route: looks up the destination in the Growth DB,
 * logs a click for attribution, and 302-redirects. Click logging never blocks
 * the redirect — if the DB is slow or unset, the user still gets sent through.
 *
 * A small static fallback map guarantees the core partner links resolve even
 * before the database is seeded, so blog posts never ship a dead link.
 */
export const prerender = false;

// Resilience fallback. The DB row (if present) always takes precedence.
const FALLBACK: Record<string, string> = {
  expensify: 'https://www.expensify.com/',
  wave: 'https://www.waveapps.com/',
  bonsai: 'https://www.hellobonsai.com/',
  honeybook: 'https://www.honeybook.com/',
  mercury: 'https://mercury.com/',
  wise: 'https://wise.com/',
  quickbooks: 'https://quickbooks.intuit.com/',
};

export const GET: APIRoute = async ({ params, request }) => {
  const slug = (params.slug ?? '').toLowerCase();

  let target: string | null = null;

  // 1. Prefer the database row (source of truth, supports adding links w/o deploy).
  try {
    const db = await getGrowthDb();
    const link = await db.collection('affiliate_links').findOne({ slug, active: { $ne: false } });
    if (link?.target_url) {
      target = link.target_url as string;

      // 2. Fire-and-forget click log. Never let this delay or break the redirect.
      const ua = request.headers.get('user-agent') ?? '';
      const referer = request.headers.get('referer') ?? '';
      void db
        .collection('affiliate_clicks')
        .insertOne({ slug, target_url: target, user_agent: ua, referer, clicked_at: new Date() })
        .catch(() => {});
    }
  } catch {
    // DB unavailable / not configured — fall through to the static map.
  }

  target ??= FALLBACK[slug] ?? null;

  if (!target) {
    // Unknown slug: send to the comparisons hub rather than erroring.
    return new Response(null, { status: 302, headers: { Location: '/comparisons' } });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store' },
  });
};
