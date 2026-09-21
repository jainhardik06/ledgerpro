import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { finalizeInvoice } from '@/lib/agency/domain/agency.invoices';
import { trackNamedOperation } from '@/lib/agency/analytics/observability';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/invoices/:id/finalize (Module 9 §83)
 *
 * THE critical operation: validate → verify reservations → allocate the
 * number (§74) → finalize (SENT, §79) → mark sources INVOICED → audit, with
 * compensating rollback. Admin/finance only (agency.invoices.write, §67/§81).
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.invoices.write');
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
    // §116 — invoice_finalize_duration: the number-allocating critical path
    // is timed on success and failure alike (a DomainResult failure is a
    // normal response; only a throw is an error). Fire-and-forget telemetry.
    const result = await trackNamedOperation(
      'agency_invoice_finalize_duration', tenantId, { query: 'finalizeInvoice' },
      () => finalizeInvoice(id, tenantId, { userId: session.userId, role: session.role }, {
        username: session.username,
        tenantId,
        log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
      })
    );
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data });
  } catch (error) {
    logError('agency:finalize invoice error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to finalize invoice' }, { status: 500 });
  }
}
