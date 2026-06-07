import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getRecurringTransactions, createTransaction, updateRecurringTransaction, createLog } from '@/lib/db';

function addInterval(dateStr: string, interval: 'Daily' | 'Weekly' | 'Monthly'): string {
  const d = new Date(dateStr);
  if (interval === 'Daily') d.setDate(d.getDate() + 1);
  if (interval === 'Weekly') d.setDate(d.getDate() + 7);
  if (interval === 'Monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recurringTxs = await getRecurringTransactions(session.tenantId);
    const today = new Date().toISOString().split('T')[0];
    let triggeredCount = 0;

    for (const rt of recurringTxs) {
      let currentNextRun = rt.nextRunDate;

      // While the nextRunDate is today or in the past, execute it.
      while (currentNextRun <= today) {
        // Create the transaction
        await createTransaction({
          tenantId: rt.tenantId,
          userId: rt.userId,
          username: rt.username || 'System',
          accountId: rt.accountId,
          type: rt.type,
          description: `[Auto] ${rt.description}`,
          amount: rt.amount,
          date: currentNextRun, // Execute on the day it was supposed to run
          category: rt.category
        });

        currentNextRun = addInterval(currentNextRun, rt.interval);
        triggeredCount++;
      }

      // If we processed any runs, update the recurring record
      if (currentNextRun !== rt.nextRunDate) {
        await updateRecurringTransaction(rt.id!, session.tenantId, {
          lastRunDate: today,
          nextRunDate: currentNextRun
        });
      }
    }

    if (triggeredCount > 0) {
      await createLog('System', 'Auto Trigger', `Processed ${triggeredCount} recurring transactions`, session.tenantId);
    }

    return NextResponse.json({ success: true, triggered: triggeredCount });
  } catch (error: any) {
    console.error('Trigger recurring error:', error);
    return NextResponse.json({ error: 'Failed to trigger recurring transactions' }, { status: 500 });
  }
}
