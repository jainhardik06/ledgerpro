import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { updateTenant, createLog } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const success = await updateTenant(id, body);
    if (!success) {
      return NextResponse.json({ error: 'Failed to update tenant' }, { status: 400 });
    }

    await createLog(session.username, 'Update Tenant', `Updated tenant ${id} with ${JSON.stringify(body)}`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Tenant update error:', error);
    return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
  }
}
