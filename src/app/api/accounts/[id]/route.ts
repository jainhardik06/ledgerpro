import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteAccount, createLog } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const success = await deleteAccount(id, session.tenantId);
    
    if (success) {
      await createLog(session.username, 'Delete Account', `Deleted account ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'An error occurred deleting the account' },
      { status: 500 }
    );
  }
}


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { updateAccount } = await import('@/lib/db');
    
    let updates = body;
    

    const success = await updateAccount(id, session.tenantId, updates);
    if (success) {
      const { createLog } = await import('@/lib/db');
      await createLog(session.username, 'Edit accounts', `Edited accounts ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
