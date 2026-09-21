import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyProfitabilitySettings } from '@/lib/agency/domain/agency.settings';
import { toPublicAgencySettings } from '@/lib/agency/types/agency-settings';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/settings/profitability (Module 17, §46/§52)
 *
 * Merge-patch the profitability section (agency.settings.manage):
 * targetProjectMargin / hourWarningThresholds / overdueWarningDays. §46 —
 * these are alert THRESHOLDS, not formulas: the hour bands and overdue window
 * are written through to the Module 15 rule configurations (each carrying its
 * own ALERT_RULE_UPDATED audit); the profitability engine's math is untouched.
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.settings.manage');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await updateAgencyProfitabilitySettings(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update profitability settings' }, { status: result.status });
    }
    return NextResponse.json({ success: true, settings: toPublicAgencySettings(result.data) });
  } catch (error) {
    logError('agency:update profitability settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update profitability settings' }, { status: 500 });
  }
}
