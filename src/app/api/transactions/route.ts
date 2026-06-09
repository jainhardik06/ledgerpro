import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTransactions, createTransaction, createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { validateAmount, validateDateString, validateString } from '@/lib/validation';
import PostHogClient from '@/lib/posthog-server';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const transactions = await getTransactions(session.tenantId, {
      page: Number(searchParams.get('page') || 1),
      limit: Number(searchParams.get('limit') || 50),
    });

    return NextResponse.json({ success: true, transactions });
  } catch (error) {
    logError('Fetch transactions error', error);
    return NextResponse.json(
      { error: 'An error occurred fetching transactions' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { type, description, amount, date, category, accountId, clientId, notes } = await req.json();

    if (type !== 'Credit' && type !== 'Debit') {
      return NextResponse.json({ error: 'Type must be either Credit or Debit' }, { status: 400 });
    }

    const cleanDescription = validateString(description, 'Description', { min: 1, max: 200 });
    if (cleanDescription instanceof NextResponse) return cleanDescription;
    const cleanAccountId = validateString(accountId, 'Account', { min: 1, max: 100 });
    if (cleanAccountId instanceof NextResponse) return cleanAccountId;
    const parsedAmount = validateAmount(amount);
    if (parsedAmount instanceof NextResponse) return parsedAmount;
    const cleanDate = validateDateString(date);
    if (cleanDate instanceof NextResponse) return cleanDate;
    const cleanCategory = validateString(category, 'Category', { max: 80, required: false });
    if (cleanCategory instanceof NextResponse) return cleanCategory;
    const cleanClientId = validateString(clientId, 'Client', { max: 100, required: false });
    if (cleanClientId instanceof NextResponse) return cleanClientId;
    const cleanNotes = validateString(notes, 'Notes', { max: 2000, required: false });
    if (cleanNotes instanceof NextResponse) return cleanNotes;

    const newTx = await createTransaction({
      tenantId: session.tenantId,
      userId: session.userId,
      username: session.username,
      accountId: cleanAccountId,
      type,
      description: cleanDescription,
      amount: parsedAmount,
      date: cleanDate,
      category: cleanCategory,
      clientId: cleanClientId || undefined,
      notes: cleanNotes,
    });

    await createLog(session.username, 'Add Record', `Added ${type} record: ${cleanDescription} (${parsedAmount})`, session.tenantId);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: 'TRANSACTION_CREATED',
      properties: { 
        transactionId: newTx.id || newTx._id?.toString(),
        amount: parsedAmount,
        type: type,
        workspaceId: session.tenantId
      }
    });

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error) {
    logError('Create transaction error', error);
    return NextResponse.json(
      { error: 'An error occurred creating the transaction' },
      { status: 500 }
    );
  }
}
