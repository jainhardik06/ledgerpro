import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createInvoicePaymentLink } from '@/lib/agency/domain/agency.payment-links';
import { toPublicPaymentLink } from '@/lib/agency/types/payment-link';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/invoices/:id/payment-link (Module 12 §55)
 *
 * Create a Razorpay payment link for a finalized invoice. Admin/finance only
 * (agency.payments.write — the collection mechanism is payments territory).
 *
 * §36 — the SERVER resolves the amount (invoice.total − settled) itself; the
 * body's optional `amount` may only be a partial (≤ amountDue). §53 — the
 * response carries shortUrl and public checkout info ONLY, never a secret.
 * A 503 means Razorpay is not configured (fail closed, §54).
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
    const payload = await req.json().catch(() => ({}));
    const ipAddress = firstClientIp(req);
    const result = await createInvoicePaymentLink(
      tenantId,
      { userId: session.userId, role: session.role },
      id,
      payload,
      { username: session.username, tenantId, log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress) }
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    // §53 — the deliberate public projection (shortUrl only, never secrets).
    return NextResponse.json({ success: true, paymentLink: toPublicPaymentLink(result.data) }, { status: 201 });
  } catch (error) {
    logError('agency:create payment link error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
  }
}
