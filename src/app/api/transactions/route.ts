import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTransactions, createTransaction, createLog } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const transactions = await getTransactions(session.tenantId);
    
    // Sort transactions by date ascending for sequential operations (running balance)
    // then we return them to the client
    return NextResponse.json({ success: true, transactions });
  } catch (error: any) {
    console.error('Fetch transactions error:', error);
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

    if (!type || !description || amount === undefined || !date || !accountId) {
      return NextResponse.json(
        { error: 'All fields (type, description, amount, date, account) are required' },
        { status: 400 }
      );
    }

    if (type !== 'Credit' && type !== 'Debit') {
      return NextResponse.json(
        { error: 'Type must be either Credit or Debit' },
        { status: 400 }
      );
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    const newTx = await createTransaction({
      tenantId: session.tenantId,
      userId: session.userId,
      username: session.username,
      accountId,
      type,
      description,
      amount: parsedAmount,
      date,
      category: category || '',
      clientId: clientId || undefined,
      notes: notes || '',
    });

    await createLog(session.username, 'Add Record', `Added ${type} record: ${description} (₹${parsedAmount})`, session.tenantId);

    return NextResponse.json({ success: true, transaction: newTx });
  } catch (error: any) {
    console.error('Create transaction error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the transaction' },
      { status: 500 }
    );
  }
}
