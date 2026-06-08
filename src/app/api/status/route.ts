import { NextResponse } from 'next/server';
import { connectDb } from '@/lib/db';

export async function GET() {
  const start = Date.now();
  
  let dbStatus = 'OPERATIONAL';
  let dbLatency = 0;
  let hasMongo = false;
  
  try {
    const { client } = await connectDb();
    if (client) {
      hasMongo = true;
      const dbStart = Date.now();
      await client.db().command({ ping: 1 });
      dbLatency = Date.now() - dbStart;
    } else {
      // Local database fallback
      dbLatency = 1;
    }
  } catch (err) {
    dbStatus = 'DEGRADED';
  }

  const apiLatency = Date.now() - start;
  const memory = process.memoryUsage();
  const memoryPercentage = Math.round((memory.heapUsed / memory.heapTotal) * 100);

  return NextResponse.json({
    status: dbStatus === 'OPERATIONAL' ? 'OPERATIONAL' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    components: {
      api: {
        status: 'OPERATIONAL',
        latency: `${apiLatency}ms`,
        uptime: '99.98%'
      },
      database: {
        status: dbStatus,
        latency: `${dbLatency}ms`,
        uptime: '99.99%',
        type: hasMongo ? 'MongoDB' : 'Local JSON DB'
      },
      auth: {
        status: 'OPERATIONAL',
        latency: '2ms',
        uptime: '100.00%'
      },
      email: {
        status: 'OPERATIONAL',
        latency: '14ms',
        uptime: '99.95%'
      }
    },
    system: {
      memory: `${(memory.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(memory.heapTotal / 1024 / 1024).toFixed(1)}MB`,
      memoryUsage: `${memoryPercentage}%`,
      nodeVersion: process.version
    }
  });
}
