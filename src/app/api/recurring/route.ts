import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRecurringTransactions, createRecurringTransaction, createLog } from '@/lib/db';
import { validateAmount, validateDateString, validateEnum, validateString } from '@/lib/validation';

const transactionTypes = ['Credit', 'Debit'] as const;
const intervals = ['Daily', 'Weekly', 'Monthly'] as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const recurring = await getRecurringTransactions(session.tenantId);
    return NextResponse.json({ success: true, recurring });
  } catch (error) {
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
    const cleanType = validateEnum(data.type, 'Type', transactionTypes);
    if (cleanType instanceof NextResponse) return cleanType;
    const cleanDescription = validateString(data.description, 'Description', { min: 1, max: 160 });
    if (cleanDescription instanceof NextResponse) return cleanDescription;
    const cleanAmount = validateAmount(data.amount);
    if (cleanAmount instanceof NextResponse) return cleanAmount;
    const cleanAccountId = validateString(data.accountId, 'Account ID', { min: 1, max: 120 });
    if (cleanAccountId instanceof NextResponse) return cleanAccountId;
    const cleanInterval = validateEnum(data.interval, 'Interval', intervals);
    if (cleanInterval instanceof NextResponse) return cleanInterval;
    const cleanNextRunDate = validateDateString(data.nextRunDate, 'Next run date');
    if (cleanNextRunDate instanceof NextResponse) return cleanNextRunDate;
    const cleanCategory = validateString(data.category, 'Category', { max: 80, required: false });
    if (cleanCategory instanceof NextResponse) return cleanCategory;

    const newRT = await createRecurringTransaction({
      tenantId: session.tenantId,
      userId: session.userId,
      username: session.username,
      accountId: cleanAccountId,
      type: cleanType,
      description: cleanDescription,
      amount: cleanAmount,
      category: cleanCategory || '',
      interval: cleanInterval,
      nextRunDate: cleanNextRunDate,
    });

    await createLog(session.username, 'Add Recurring', `Added recurring ${cleanType}: ${cleanDescription}`, session.tenantId);

    return NextResponse.json({ success: true, recurring: newRT });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add recurring' }, { status: 500 });
  }
}
