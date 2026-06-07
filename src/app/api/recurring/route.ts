import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRecurringTransactions, createRecurringTransaction, createLog } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const recurring = await getRecurringTransactions(session.tenantId);
    return NextResponse.json({ success: true, recurring });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch recurring' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await req.json();

    if (!data.type || !data.description || data.amount === undefined || !data.accountId || !data.interval || !data.nextRunDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newRT = await createRecurringTransaction({
      tenantId: session.tenantId,
      userId: session.userId,
      username: session.username,
      accountId: data.accountId,
      type: data.type,
      description: data.description,
      amount: Number(data.amount),
      category: data.category || '',
      interval: data.interval,
      nextRunDate: data.nextRunDate,
    });

    await createLog(session.username, 'Add Recurring', `Added recurring ${data.type}: ${data.description}`, session.tenantId);

    return NextResponse.json({ success: true, recurring: newRT });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to add recurring' }, { status: 500 });
  }
}
