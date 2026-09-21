import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { retryGatewayPayment } from '@/lib/agency/domain/agency.payments';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/payments/:id/reconcile (Module 10 §115, 10F)
 *
 * Manual retry/recovery for a gateway payment a webhook could not finish:
 * re-drives the NORMAL confirmPayment path (§91/§108/§114 all apply — no
 * gateway shortcut). Body may carry { accountId } — §108, the tracked
 * account the gateway money lands in when it was not set at intake.
 * A domain refusal keeps reconciliationStatus ERROR and returns the
 * rejection; success lands RECONCILED.
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
    const result = await retryGatewayPayment(
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
    logError('agency:reconcile payment error', error, { tenantId, paymentId: id });
    return NextResponse.json({ error: 'Failed to reconcile payment' }, { status: 500 });
  }
}
