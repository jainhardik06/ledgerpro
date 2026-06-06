import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { updateTransaction, deleteTransaction, createLog } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { type, description, amount, date, category } = await req.json();

    const updates: any = {};
    if (type) {
      if (type !== 'Credit' && type !== 'Debit') {
        return NextResponse.json(
          { error: 'Type must be either Credit or Debit' },
          { status: 400 }
        );
      }
      updates.type = type;
    }

    if (description !== undefined) {
      updates.description = description;
    }

    if (amount !== undefined) {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json(
          { error: 'Amount must be a positive number' },
          { status: 400 }
        );
      }
      updates.amount = parsedAmount;
    }

    if (date) {
      updates.date = date;
    }

    if (category !== undefined) {
      updates.category = category;
    }

    const success = await updateTransaction(id, session.userId, updates);
    if (!success) {
      return NextResponse.json(
        { error: 'Transaction not found or unauthorized' },
        { status: 404 }
      );
    }

    await createLog(session.username, 'Edit Record', `Updated transaction (ID: ${id})`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update transaction error:', error);
    return NextResponse.json(
      { error: 'An error occurred updating the transaction' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const success = await deleteTransaction(id, session.userId);

    if (!success) {
      return NextResponse.json(
        { error: 'Transaction not found or unauthorized' },
        { status: 404 }
      );
    }

    await createLog(session.username, 'Delete Record', `Deleted transaction (ID: ${id})`);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete transaction error:', error);
    return NextResponse.json(
      { error: 'An error occurred deleting the transaction' },
      { status: 500 }
    );
  }
}
