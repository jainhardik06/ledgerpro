import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteRecurringTransaction, createLog, updateRecurringTransaction } from '@/lib/db';
import { validateAmount, validateDateString, validateEnum, validateString } from '@/lib/validation';

const transactionTypes = ['Credit', 'Debit'] as const;
const intervals = ['Daily', 'Weekly', 'Monthly'] as const;

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
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { accountId, type, description, amount, category, interval, nextRunDate, lastRunDate } = await req.json();
    const updates: {
      accountId?: string;
      type?: 'Credit' | 'Debit';
      description?: string;
      amount?: number;
      category?: string;
      interval?: 'Daily' | 'Weekly' | 'Monthly';
      nextRunDate?: string;
      lastRunDate?: string;
    } = {};

    if (accountId !== undefined) {
      const cleanAccountId = validateString(accountId, 'Account ID', { min: 1, max: 120 });
      if (cleanAccountId instanceof NextResponse) return cleanAccountId;
      updates.accountId = cleanAccountId;
    }
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
    if (category !== undefined) {
      const cleanCategory = validateString(category, 'Category', { max: 80, required: false });
      if (cleanCategory instanceof NextResponse) return cleanCategory;
      updates.category = cleanCategory;
    }
    if (interval !== undefined) {
      const cleanInterval = validateEnum(interval, 'Interval', intervals);
      if (cleanInterval instanceof NextResponse) return cleanInterval;
      updates.interval = cleanInterval;
    }
    if (nextRunDate !== undefined) {
      const cleanNextRunDate = validateDateString(nextRunDate, 'Next run date');
      if (cleanNextRunDate instanceof NextResponse) return cleanNextRunDate;
      updates.nextRunDate = cleanNextRunDate;
    }
    if (lastRunDate !== undefined) {
      const cleanLastRunDate = validateDateString(lastRunDate, 'Last run date');
      if (cleanLastRunDate instanceof NextResponse) return cleanLastRunDate;
      updates.lastRunDate = cleanLastRunDate;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid recurring transaction fields provided' }, { status: 400 });
    }

    const success = await updateRecurringTransaction(id, session.tenantId, updates);
    if (success) {
      await createLog(session.username, 'Edit recurring', `Edited recurring ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
