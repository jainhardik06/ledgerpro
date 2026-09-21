import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getExpenseById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateExpense } from '@/lib/agency/domain/agency.expenses';
import { redactExpenseCost } from '@/lib/agency/types/expense';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/expenses/:id (Module 8 §51)
 *
 *   GET   — one expense. Owner or admin only (§33 pattern); cost side
 *           redacted for non-admins (§99). Cross-tenant ids are an
 *           identical 404 (§113).
 *   PATCH — the §22-pattern lifecycle edit (full pre-approval / notes +
 *           receipt only after approval / locked once invoiced or
 *           reimbursed), enforced by the domain.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const expense = await getExpenseById(id, tenantId);
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    // §33 pattern — a USER reads only their own expenses.
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    if (!isAdmin && expense.createdBy !== session.userId) {
      return NextResponse.json({ error: 'You can only view your own expenses' }, { status: 403 });
    }

    return NextResponse.json({ success: true, expense: isAdmin ? expense : redactExpenseCost(expense) });
  } catch (error) {
    logError('agency:fetch expense error', error, { tenantId, expenseId: id });
    return NextResponse.json({ error: 'Failed to fetch expense' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.expenses.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateExpense(id, tenantId, { userId: session.userId, role: session.role }, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    return NextResponse.json({ success: true, expense: isAdmin ? result.data : redactExpenseCost(result.data) });
  } catch (error) {
    logError('agency:update expense error', error, { tenantId, expenseId: id });
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}
