import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { resolveAlert } from '@/lib/agency/alerts/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agency/alerts/:id/resolve (Module 15 §19)
 *
 * OPEN/ACKNOWLEDGED → RESOLVED (agency.alerts.manage). RESOLVED is terminal
 * for MANUAL moves — if the condition RETURNS, the next evaluation reopens
 * the alert (a new OPEN cycle), never this API. Audited as ALERT_RESOLVED.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAgencyPermission('agency.alerts.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const { id } = await ctx.params;
    const ipAddress = firstClientIp(req);
    const result = await resolveAlert(tenantId, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, id);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to resolve alert' }, { status: result.status });
    }
    return NextResponse.json({ success: true, alert: result.data });
  } catch (error) {
    logError('agency:resolve alert error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to resolve alert' }, { status: 500 });
  }
}
