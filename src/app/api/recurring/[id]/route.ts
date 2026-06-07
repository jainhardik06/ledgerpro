import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteRecurringTransaction, createLog } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const success = await deleteRecurringTransaction(id, session.tenantId);
    if (success) {
      await createLog(session.username, 'Delete Recurring', `Deleted recurring transaction ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { updateRecurringTransaction } = await import('@/lib/db');
    
    let updates = body;
    

    const success = await updateRecurringTransaction(id, session.tenantId, updates);
    if (success) {
      const { createLog } = await import('@/lib/db');
      await createLog(session.username, 'Edit recurring', `Edited recurring ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
