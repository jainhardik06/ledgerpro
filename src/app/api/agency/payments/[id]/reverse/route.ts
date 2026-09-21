import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { reversePayment } from '@/lib/agency/domain/agency.payments';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/payments/:id/reverse (Module 10 §103/§110)
 *
 * CONFIRMED → REVERSED. The payment is never deleted — it stays in history
 * and a compensating Debit transaction returns the cash, keeping the account
 * balance honest. The invoice's settled money drops (§104) and its status
 * walks back through the Module 10 reversal edges (§79). Body may carry
 * { reason } for the audit trail.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.payments.write');
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
    const result = await reversePayment(
      id,
      tenantId,
      { userId: session.userId, role: session.role, username: session.username },
      body,
      {
        username: session.username,
        tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      }
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      payment: result.data.payment,
      invoice: result.data.invoice,
      transactionId: result.data.transactionId,
    });
  } catch (error) {
    logError('agency:reverse payment error', error, { tenantId, paymentId: id });
    return NextResponse.json({ error: 'Failed to reverse payment' }, { status: 500 });
  }
}
