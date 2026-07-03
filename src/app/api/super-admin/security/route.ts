import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getLogs, connectDb } from '@/lib/db';
import { logError } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allLogs = await getLogs(undefined, { limit: 100 });
    const failedLogins = allLogs
      .filter(log => log.action === 'FAILED_LOGIN')
      .slice(0, 50)
      .map(log => ({
        id: log.id,
        username: log.username,
        action: log.action,
        details: log.details,
        tenantId: log.tenantId,
        ipAddress: log.ipAddress,
        timestamp: log.timestamp,
      }));

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
      },
    });
  } catch (error) {
    logError('Security fetch error', error);
    return NextResponse.json({ error: 'Failed to fetch security metrics' }, { status: 500 });
  }
}
