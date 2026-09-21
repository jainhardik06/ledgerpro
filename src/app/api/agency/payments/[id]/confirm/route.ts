import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { confirmPayment } from '@/lib/agency/domain/agency.payments';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/payments/:id/confirm (Module 10 §101/§114)
 *
 * THE money-moving action: PENDING → CONFIRMED. Creates exactly one core
 * Transaction (Credit, §94/§95/§129), recomputes the invoice's payment
 * state through the §104 engine (amountPaid/amountDue + §79 status), all
 * with compensating rollback. Body may carry { accountId } — §108, the
 * account the confirmed money enters when it was not set at record time.
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
    const options = typeof body?.accountId === 'string' && body.accountId.trim() !== ''
      ? { accountId: body.accountId.trim() }
      : undefined;
    const ipAddress = firstClientIp(req);
    const result = await confirmPayment(
      id,
      tenantId,
      { userId: session.userId, role: session.role, username: session.username },
      options,
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
    logError('agency:confirm payment error', error, { tenantId, paymentId: id });
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
  }
}
