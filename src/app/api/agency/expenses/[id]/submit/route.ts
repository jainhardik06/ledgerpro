import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { submitExpense } from '@/lib/agency/domain/agency.expenses';
import { redactExpenseCost } from '@/lib/agency/types/expense';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/expenses/:id/submit (Module 8 §40/§51)
 *
 * DRAFT → SUBMITTED. The owner moves their expense into the approval queue.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
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
    const ipAddress = firstClientIp(req);
    const result = await submitExpense(id, tenantId, { userId: session.userId, role: session.role }, {
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
    logError('agency:submit expense error', error, { tenantId, expenseId: id });
    return NextResponse.json({ error: 'Failed to submit expense' }, { status: 500 });
  }
}
