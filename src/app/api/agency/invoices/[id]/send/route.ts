import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { sendInvoice } from '@/lib/agency/domain/agency.invoices';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/invoices/:id/send (Module 9 §81/§82)
 *
 * Records the delivery act: stamps sentAt + an INVOICE_SENT audit event.
 * Finalization is issuance (DRAFT → SENT, §74 number); this is the send
 * half of wizard step 8 and may be repeated (each send is audited). A
 * DRAFT (no number, §74) or VOID invoice is a 409. Admin/finance only
 * (agency.invoices.write).
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
    const result = await sendInvoice(id, tenantId, { userId: session.userId, role: session.role }, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, invoice: result.data });
  } catch (error) {
    logError('agency:send invoice error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
}
