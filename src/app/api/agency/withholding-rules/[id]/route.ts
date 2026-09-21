import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateWithholdingRule } from '@/lib/agency/domain/agency.tax';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/withholding-rules/:id (Module 11 §19/§115)
 *
 *   PATCH — partial update of a withholding rule configuration
 *          (agency.tax.manage): rate/threshold/dates/conditions/active.
 *          Effective dating is the rule's OWN fields — a rate change is a new
 *          effective-dated configuration, never a silent rewrite of history.
 *          A missing rule and another tenant's rule are IDENTICAL 404s (§113).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAgencyPermission('agency.tax.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateWithholdingRule(tenantId, id, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update withholding rule' }, { status: result.status });
    }
    return NextResponse.json({ success: true, rule: result.data });
  } catch (error) {
    logError('agency:update withholding rule error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update withholding rule' }, { status: 500 });
  }
}
