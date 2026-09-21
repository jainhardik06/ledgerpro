import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getClientById, getAccountById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { getPayment } from '@/lib/agency/domain/agency.payments';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/payments/:id (Module 10 §110)
 *
 * One payment with its invoice (§93 — exactly one) and labels. Readable by
 * the whole agency workspace (§28 pattern). §113 — another tenant's payment
 * is indistinguishable from a missing one (identical 404).
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
  const { id } = await ctx.params;

  try {
    const result = await getPayment(id, tenantId);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { payment, invoice } = result.data;
    const client = invoice ? await getClientById(invoice.clientId, tenantId) : null;
    const account = payment.accountId ? await getAccountById(payment.accountId, tenantId) : null;
    return NextResponse.json({
      success: true,
      payment,
      invoice,
      clientName: client?.name ?? null,
      accountName: account?.name ?? null,
    });
  } catch (error) {
    logError('agency:fetch payment error', error, { tenantId, paymentId: id });
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 });
  }
}
