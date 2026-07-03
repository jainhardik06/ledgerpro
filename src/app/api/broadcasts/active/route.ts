import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getBroadcasts, connectDb, initLocalDb, safeObjectId } from '@/lib/db';

/**
 * Tenant-facing counterpart to /api/super-admin/communications — returns
 * the most recent broadcast that matches this user's audience targeting,
 * so the "Deploy Global Notice" composer actually reaches tenant dashboards
 * instead of only ever being visible in the super-admin table.
 */
export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let plan: string | null = null;
    if (session.tenantId) {
      const { db } = await connectDb();
      const tenant = db
        ? await db.collection('tenants').findOne({ _id: safeObjectId(session.tenantId) })
        : initLocalDb().tenants.find(t => t.id === session.tenantId);
      plan = tenant?.plan ?? null;
    }

    const broadcasts = await getBroadcasts();
    const match = broadcasts.find(b => {
      if (b.target === 'Administrators Only') return session.role === 'TENANT_ADMIN' || session.role === 'SUPER_ADMIN';
      if (b.target === 'Enterprise Plans Only') return plan === 'ENTERPRISE';
      return true; // 'All Active Tenants'
    });

    return NextResponse.json({ broadcast: match ?? null });
  } catch (error) {
    console.error('Active broadcast fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch active broadcast' }, { status: 500 });
  }
}
