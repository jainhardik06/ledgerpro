import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { addInvoiceLine } from '@/lib/agency/domain/agency.invoices';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/invoices/:id/lines (Module 9 §59/§82)
 *
 * Add one line to a DRAFT. Source-backed types (TIME/EXPENSE/MILESTONE) are
 * eligibility-checked (§70 — a conflict is an explicit 409, never a silent
 * skip, §84) and RESERVED for this draft (§63). MANUAL/FIXED_FEE lines carry
 * the payload amount (§71). The engine recomputes all money.
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
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await addInvoiceLine(id, tenantId, { userId: session.userId, role: session.role }, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    return NextResponse.json({ success: true, line: result.data.line, invoice: result.data.invoice }, { status: 201 });
  } catch (error) {
    logError('agency:add invoice line error', error, { tenantId, invoiceId: id });
    return NextResponse.json({ error: 'Failed to add invoice line' }, { status: 500 });
  }
}
