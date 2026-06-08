import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLogs } from '@/lib/db';
import { logError } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const options = {
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 50),
    };

    if (session.role === 'SUPER_ADMIN') {
      const logs = await getLogs(undefined, options);
      return NextResponse.json({ success: true, logs });
    }

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Missing tenant' }, { status: 401 });
    }

    const logs = await getLogs(session.tenantId, options);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    logError('Fetch logs error', error);
    return NextResponse.json(
      { error: 'An error occurred fetching logs' },
      { status: 500 }
    );
  }
}
