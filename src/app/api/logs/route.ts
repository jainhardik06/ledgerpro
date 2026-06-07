import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLogs } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let logs;
    if (session.role === 'SUPER_ADMIN') {
      logs = await getLogs(); // gets all logs globally
    } else if (session.tenantId) {
      logs = await getLogs(session.tenantId);
    } else {
      return NextResponse.json({ error: 'Missing tenant' }, { status: 401 });
    }

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    console.error('Fetch logs error:', error);
    return NextResponse.json(
      { error: 'An error occurred fetching logs' },
      { status: 500 }
    );
  }
}
