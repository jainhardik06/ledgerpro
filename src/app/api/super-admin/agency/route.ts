import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenants } from '@/lib/db';
import { getPlatformAgencyRows } from '@/lib/agency/queries/platform-analytics';
import { summarizePlatformAgency } from '@/lib/agency/analytics/platform-summary';

export const dynamic = 'force-dynamic';

/**
 * GET /api/super-admin/agency — platform-wide Agency vertical analytics.
 *
 * The post-Phase-1 Platform Console surface: adoption of the agency
 * vertical, the §80 activation funnel, platform money volume (invoiced /
 * collected / outstanding — never converted across currencies), and a
 * per-tenant activity table. SUPER_ADMIN only; every other session gets
 * 401 (the platform scope must never leak to tenant sessions).
 *
 * Reads only — no mutations, no tenant data leaves the aggregation layer
 * (per-tenant money arrives as already-folded sums, never raw documents).
 */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [rows, tenants] = await Promise.all([getPlatformAgencyRows(), getTenants()]);
    const identities = tenants
      .map(t => ({
        id: t.id || t._id?.toString() || '',
        name: t.name,
        appMode: t.appMode,
        status: t.status,
        plan: t.plan,
      }))
      .filter(t => t.id !== '');

    const summary = summarizePlatformAgency(rows, identities);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Super-admin agency analytics error:', error);
    return NextResponse.json({ error: 'Failed to load agency analytics' }, { status: 500 });
  }
}
