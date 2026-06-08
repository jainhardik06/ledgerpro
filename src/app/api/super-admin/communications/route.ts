import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getBroadcasts, createBroadcast, createLog } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const broadcasts = await getBroadcasts();

    return NextResponse.json(broadcasts);
  } catch (error) {
    console.error('Broadcasts fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type, message, target } = body;

    const broadcast = await createBroadcast({ type, message, target });
    
    // Log the broadcast event
    await createLog(session.username, 'GLOBAL_BROADCAST_DEPLOYED', `Type: ${type}, Target: ${target}`, undefined, 'API');

    return NextResponse.json(broadcast, { status: 201 });
  } catch (error) {
    console.error('Broadcast creation error:', error);
    return NextResponse.json({ error: 'Failed to deploy broadcast notice' }, { status: 500 });
  }
}
