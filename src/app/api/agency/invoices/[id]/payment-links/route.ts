import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { logError } from '@/lib/logger';
import { listInvoicePaymentLinks } from '@/lib/agency/domain/agency.payment-links';
import { toPublicPaymentLink } from '@/lib/agency/types/payment-link';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/invoices/:id/payment-links (Module 12 §55)
 *
 * The invoice's link history (§34 — an invoice may accumulate expired,
 * cancelled and active links; the invoice stays the financial document).
 * Read surface: agency.dashboard.read. §53 — public projections only.
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const result = await listInvoicePaymentLinks(tenantId, id);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      paymentLinks: result.data.map(toPublicPaymentLink),
    });
  } catch (error) {
    logError('agency:list payment links error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to load payment links' }, { status: 500 });
  }
}
