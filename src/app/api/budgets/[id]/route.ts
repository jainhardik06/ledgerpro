import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteBudget, updateBudget, createLog } from '@/lib/db';
import { validateAmount } from '@/lib/validation';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const success = await deleteBudget(id, session.tenantId);
    if (success) {
      await createLog(session.username, 'Delete Budget', `Deleted budget ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const cleanLimitAmount = validateAmount(body.limitAmount, 'Budget limit');
    if (cleanLimitAmount instanceof NextResponse) return cleanLimitAmount;
    const success = await updateBudget(id, session.tenantId, cleanLimitAmount);
    if (success) {
      await createLog(session.username, 'Edit Budget', `Edited budget ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
