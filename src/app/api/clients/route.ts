import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getClients, createClient, createLog } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const clients = await getClients(session.tenantId);
    return NextResponse.json({ success: true, clients });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, email } = await req.json();

    if (!name) {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }

    const newClient = await createClient(session.tenantId, name, email);
    await createLog(session.username, 'Add Client', `Added client: ${name}`, session.tenantId);

    return NextResponse.json({ success: true, client: newClient });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to add client' }, { status: 500 });
  }
}
