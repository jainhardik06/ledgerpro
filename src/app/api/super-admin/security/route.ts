import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLogs, connectDb } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch Failed Logins
    const allLogs = await getLogs();
    const failedLogins = allLogs.filter(log => log.action === 'FAILED_LOGIN');

    // 2. Ping Database Health
    const { client } = await connectDb();
    let dbStatus = 'Offline (Local)';
    let pingTime = 0;

    if (client) {
      const start = Date.now();
      await client.db().command({ ping: 1 });
      pingTime = Date.now() - start;
      dbStatus = 'Online (MongoDB Atlas)';
    }

    return NextResponse.json({
      failedLogins,
      health: {
        status: dbStatus,
        ping: pingTime,
        memoryUsage: process.memoryUsage().heapUsed,
      }
    });
  } catch (error: any) {
    console.error('Security fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch security metrics' }, { status: 500 });
  }
}
