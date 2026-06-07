import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLogs } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pass undefined to get ALL global logs
    const logs = await getLogs(undefined);

    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('Audit logs fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch global audit logs' }, { status: 500 });
  }
}
