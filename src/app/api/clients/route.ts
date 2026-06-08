import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getClients, createClient, createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { validateString } from '@/lib/validation';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clients = await getClients(session.tenantId, {
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 50),
    });
    return NextResponse.json({ success: true, clients });
  } catch (error) {
    logError('Fetch clients error', error);
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
    const cleanName = validateString(name, 'Client name', { min: 1, max: 120 });
    if (cleanName instanceof NextResponse) return cleanName;
    const cleanEmail = validateString(email, 'Email', { max: 254, required: false });
    if (cleanEmail instanceof NextResponse) return cleanEmail;

    const newClient = await createClient(session.tenantId, cleanName, cleanEmail || undefined);
    await createLog(session.username, 'Add Client', `Added client: ${cleanName}`, session.tenantId);

    return NextResponse.json({ success: true, client: newClient });
  } catch (error) {
    logError('Create client error', error);
    return NextResponse.json({ error: 'Failed to add client' }, { status: 500 });
  }
}
