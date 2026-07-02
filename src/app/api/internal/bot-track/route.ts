import { NextRequest, NextResponse } from 'next/server';
import { connectGrowthDb } from '@/lib/db';

/**
 * Receives crawler-visit pings from src/proxy.ts and writes them to the
 * Growth DB's `crawler_visits` collection — separate from the production
 * database, matching what /super-admin/discovery actually reads
 * (`crawler_visits.countDocuments({ botFamily: ... })`).
 *
 * `visited_at` (not `visitedAt`) matches the TTL index created by
 * money-os-discovery/scripts/seed-growth-db.mjs (90-day auto-prune, keeping
 * this collection well within the Atlas Free 512 MB limit).
 */
export async function POST(req: NextRequest) {
  try {
    const { botFamily, userAgent, path, ip } = await req.json();

    if (!botFamily || !userAgent) {
      return NextResponse.json({ error: 'Missing botFamily or userAgent' }, { status: 400 });
    }

    const { db } = await connectGrowthDb();
    if (!db) {
      // Growth DB not configured in this environment (e.g. local dev without
      // MONGODB_GROWTH_URI) — don't error, just skip telemetry.
      return NextResponse.json({ success: true, skipped: true });
    }

    await db.collection('crawler_visits').insertOne({
      botFamily,
      userAgent,
      path: path ?? null,
      ip: ip ?? null,
      visited_at: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch {
    // Telemetry failures must never surface as user-facing errors.
    return NextResponse.json({ error: 'Failed to track bot' }, { status: 500 });
  }
}
