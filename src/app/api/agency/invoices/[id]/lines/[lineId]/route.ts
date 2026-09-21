import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { removeInvoiceLine } from '@/lib/agency/domain/agency.invoices';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/agency/invoices/:id/lines/:lineId (Module 9 §82)
 *
 * Remove a line from a DRAFT: the source's reservation is released (§66,
 * guarded — only this draft's hold) and the engine recomputes the money.
 */
type RouteContext = { params: Promise<{ id: string; lineId: string }> };

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const gate = await requireAgencyPermission('agency.invoices.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const { id, lineId } = await ctx.params;

  try {
    const ipAddress = firstClientIp(req);
    const result = await removeInvoiceLine(id, lineId, tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data });
  } catch (error) {
    logError('agency:remove invoice line error', error, { tenantId, invoiceId: id, lineId });
    return NextResponse.json({ error: 'Failed to remove invoice line' }, { status: 500 });
  }
}
