import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { cancelPaymentLink } from '@/lib/agency/domain/agency.payment-links';
import { toPublicPaymentLink } from '@/lib/agency/types/payment-link';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/payment-links/:id/cancel (Module 12 §55)
 *
 * Cancel a CREATED payment link (§46 — the gateway call is repeat-safe; a
 * link that already moved money cannot be cancelled). Admin/finance only
 * (agency.payments.write). §113 — a missing link and another tenant's link
 * are identical (404).
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
    const ipAddress = firstClientIp(req);
    const result = await cancelPaymentLink(
      tenantId,
      { userId: session.userId, role: session.role },
      id,
      { username: session.username, tenantId, log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress) }
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, paymentLink: toPublicPaymentLink(result.data) });
  } catch (error) {
    logError('agency:cancel payment link error', error, { tenantId, linkId: id });
    return NextResponse.json({ error: 'Failed to cancel payment link' }, { status: 500 });
  }
}
