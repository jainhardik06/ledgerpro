import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getBudgets, createBudget, createLog } from '@/lib/db';
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

    if (!category || limitAmount === undefined || !month) {
      return NextResponse.json({ error: 'Category, limitAmount, and month are required' }, { status: 400 });
    }

    const newBudget = await createBudget(session.tenantId, category, Number(limitAmount), month);
    await createLog(session.username, 'Set Budget', `Set ${category} budget to ₹${limitAmount} for ${month}`, session.tenantId);

    // Analytics
    const posthog = PostHogClient();
    posthog.capture({
      distinctId: session.userId,
      event: 'BUDGET_CREATED',
      properties: { 
        budgetId: newBudget.id || newBudget._id?.toString(),
        amount: Number(limitAmount),
        period: month,
        workspaceId: session.tenantId
      }
    });

    return NextResponse.json({ success: true, budget: newBudget });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to set budget' }, { status: 500 });
  }
}
