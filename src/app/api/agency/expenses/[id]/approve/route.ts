import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { approveExpense } from '@/lib/agency/domain/agency.expenses';
import { redactExpenseCost } from '@/lib/agency/types/expense';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/expenses/:id/approve (Module 8 §40/§41/§51)
 *
 * SUBMITTED → APPROVED. The approval moment: the core Transaction is
 * created exactly once and linked (§41/§42 — idempotent via transactionId).
 * Authority is the domain's (§21 pattern: admins or the project's manager,
 * NEVER the expense's creator). The permission gate is expenses.write —
 * the tier does not decide approval, the domain does (Module 7 pattern).
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
    const result = await approveExpense(id, tenantId, { userId: session.userId, role: session.role }, {
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
    logError('agency:approve expense error', error, { tenantId, expenseId: id });
    return NextResponse.json({ error: 'Failed to approve expense' }, { status: 500 });
  }
}
