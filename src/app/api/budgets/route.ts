import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getBudgets, createBudget, createLog } from '@/lib/db';
import { validateAmount, validateString } from '@/lib/validation';
import PostHogClient from '@/lib/posthog-server';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const budgets = await getBudgets(session.tenantId);
    return NextResponse.json({ success: true, budgets });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { category, limitAmount, month } = await req.json();

    const cleanCategory = validateString(category, 'Category', { min: 1, max: 80 });
    if (cleanCategory instanceof NextResponse) return cleanCategory;
    const cleanMonth = validateString(month, 'Month', { min: 4, max: 20 });
    if (cleanMonth instanceof NextResponse) return cleanMonth;
    const cleanLimitAmount = validateAmount(limitAmount, 'Budget limit');
    if (cleanLimitAmount instanceof NextResponse) return cleanLimitAmount;

    const newBudget = await createBudget(session.tenantId, cleanCategory, cleanLimitAmount, cleanMonth);
    await createLog(session.username, 'Set Budget', `Set ${cleanCategory} budget to ₹${cleanLimitAmount} for ${cleanMonth}`, session.tenantId);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: 'BUDGET_CREATED',
      properties: { 
        budgetId: newBudget.id || newBudget._id?.toString(),
        amount: cleanLimitAmount,
        period: cleanMonth,
        workspaceId: session.tenantId
      }
    });

    return NextResponse.json({ success: true, budget: newBudget });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to set budget' }, { status: 500 });
  }
}
