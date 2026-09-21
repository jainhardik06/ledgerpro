import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { rejectExpense } from '@/lib/agency/domain/agency.expenses';
import { redactExpenseCost } from '@/lib/agency/types/expense';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/expenses/:id/reject (Module 8 §40/§51)
 *
 * SUBMITTED|APPROVED → REJECTED. Body: { reason } — required. Authority is
 * the domain's (§21 pattern, same tier as approve). Rejecting an APPROVED
 * expense is an admin correction: the linked Transaction stays (real spend
 * history), the billing side is withdrawn. Editing a rejected expense
 * returns it to DRAFT.
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
    const body = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    const result = await rejectExpense(id, tenantId, body.reason, { userId: session.userId, role: session.role }, {
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
    logError('agency:reject expense error', error, { tenantId, expenseId: id });
    return NextResponse.json({ error: 'Failed to reject expense' }, { status: 500 });
  }
}
