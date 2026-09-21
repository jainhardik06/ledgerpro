import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyAlertRule } from '@/lib/agency/alerts/service';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/alert-rules/:id (Module 15 §24)
 *
 * Admin-only (agency.alerts.manage): enable/disable a rule and/or overlay
 * its configuration (days / amount / percentage / severity — validated in
 * validators/alert.ts; unknown keys are rejected). The rule TYPE is
 * immutable — the catalog is the definition. Disabling a rule silences it:
 * the next evaluation auto-resolves its open alerts (§19). Audited as
 * ALERT_RULE_UPDATED with before/after configuration.
 */
export async function PATCH(
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
    const body = await req.json() as Record<string, unknown>;
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyAlertRule(tenantId, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    }, id, body);
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update alert rule' }, { status: result.status });
    }
    return NextResponse.json({ success: true, rule: result.data });
  } catch (error) {
    logError('agency:update alert rule error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update alert rule' }, { status: 500 });
  }
}
