import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteAccount, createLog, updateAccount } from '@/lib/db';
import { validateFiniteNumber, validateString } from '@/lib/validation';

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
  } catch (error) {
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
    const { name, type, initialBalance } = await req.json();
    const updates: { name?: string; type?: string; initialBalance?: number } = {};

    if (name !== undefined) {
      const cleanName = validateString(name, 'Account name', { min: 1, max: 80 });
      if (cleanName instanceof NextResponse) return cleanName;
      updates.name = cleanName;
    }
    if (type !== undefined) {
      const cleanType = validateString(type, 'Account type', { min: 1, max: 40 });
      if (cleanType instanceof NextResponse) return cleanType;
      updates.type = cleanType;
    }
    if (initialBalance !== undefined) {
      const cleanInitialBalance = validateFiniteNumber(initialBalance, 'Initial balance', { min: -999999999, max: 999999999 });
      if (cleanInitialBalance instanceof NextResponse) return cleanInitialBalance;
      updates.initialBalance = cleanInitialBalance;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid account fields provided' }, { status: 400 });
    }

    const success = await updateAccount(id, session.tenantId, updates);
    if (success) {
      await createLog(session.username, 'Edit accounts', `Edited accounts ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
