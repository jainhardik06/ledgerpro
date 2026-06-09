import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { updateTransaction, deleteTransaction, createLog } from '@/lib/db';
import { validateAmount, validateDateString, validateEnum, validateString } from '@/lib/validation';
import PostHogClient from '@/lib/posthog-server';

const transactionTypes = ['Credit', 'Debit'] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { id } = await params;
    const { type, description, amount, date, category, accountId, clientId, notes } = await req.json();

    const updates: {
      type?: 'Credit' | 'Debit';
      description?: string;
      amount?: number;
      date?: string;
      category?: string;
      accountId?: string;
      clientId?: string;
      notes?: string;
    } = {};
    if (type !== undefined) {
      const cleanType = validateEnum(type, 'Type', transactionTypes);
      if (cleanType instanceof NextResponse) return cleanType;
      updates.type = cleanType;
    }

    if (description !== undefined) {
      const cleanDescription = validateString(description, 'Description', { min: 1, max: 160 });
      if (cleanDescription instanceof NextResponse) return cleanDescription;
      updates.description = cleanDescription;
    }

    if (amount !== undefined) {
      const cleanAmount = validateAmount(amount);
      if (cleanAmount instanceof NextResponse) return cleanAmount;
      updates.amount = cleanAmount;
    }

    if (date !== undefined) {
      const cleanDate = validateDateString(date);
      if (cleanDate instanceof NextResponse) return cleanDate;
      updates.date = cleanDate;
    }

    if (category !== undefined) {
      const cleanCategory = validateString(category, 'Category', { max: 80, required: false });
      if (cleanCategory instanceof NextResponse) return cleanCategory;
      updates.category = cleanCategory;
    }
    if (accountId !== undefined) {
      const cleanAccountId = validateString(accountId, 'Account ID', { max: 120, required: false });
      if (cleanAccountId instanceof NextResponse) return cleanAccountId;
      updates.accountId = cleanAccountId;
    }
    if (clientId !== undefined) {
      const cleanClientId = validateString(clientId, 'Client ID', { max: 120, required: false });
      if (cleanClientId instanceof NextResponse) return cleanClientId;
      updates.clientId = cleanClientId;
    }
    if (notes !== undefined) {
      const cleanNotes = validateString(notes, 'Notes', { max: 1000, required: false });
      if (cleanNotes instanceof NextResponse) return cleanNotes;
      updates.notes = cleanNotes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid transaction fields provided' }, { status: 400 });
    }

    const success = await updateTransaction(id, session.tenantId, updates);
    if (!success) {
      return NextResponse.json(
        { error: 'Transaction not found or unauthorized' },
        { status: 404 }
      );
    }

    await createLog(session.username, 'Edit Record', `Updated transaction (ID: ${id})`, session.tenantId);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: 'TRANSACTION_UPDATED',
      properties: { 
        transactionId: id,
        workspaceId: session.tenantId,
        updates: Object.keys(updates)
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
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
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { id } = await params;
    const success = await deleteTransaction(id, session.tenantId);

    if (!success) {
      return NextResponse.json(
        { error: 'Transaction not found or unauthorized' },
        { status: 404 }
      );
    }

    await createLog(session.username, 'Delete Record', `Deleted transaction (ID: ${id})`, session.tenantId);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: 'TRANSACTION_DELETED',
      properties: { 
        transactionId: id,
        workspaceId: session.tenantId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return NextResponse.json(
      { error: 'An error occurred deleting the transaction' },
      { status: 500 }
    );
  }
}
