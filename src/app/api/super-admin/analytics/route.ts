import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getGlobalAnalytics } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const analytics = await getGlobalAnalytics();

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Analytics fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch global analytics' }, { status: 500 });
  }
}
