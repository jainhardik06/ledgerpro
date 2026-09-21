import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyGeneralSettings } from '@/lib/agency/domain/agency.settings';
import { toPublicAgencySettings } from '@/lib/agency/types/agency-settings';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/settings/general (Module 17, §44/§52)
 *
 * Merge-patch the general section (agency.settings.manage — §55: only Tenant
 * Admins modify configuration). Fields: agencyName / logoUrl /
 * defaultCurrency / timezone / fiscalYearStartMonth; absent fields keep
 * their stored value; the merged section is validated whole (§44: bounded
 * name, ISO currency, IANA timezone, month 1–12). The response is the
 * client-safe projection — general carries no secrets, but the projection
 * is applied anyway so every settings response has one shape (§48).
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
    const result = await updateAgencyGeneralSettings(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update general settings' }, { status: result.status });
    }
    return NextResponse.json({ success: true, settings: toPublicAgencySettings(result.data) });
  } catch (error) {
    logError('agency:update general settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update general settings' }, { status: 500 });
  }
}
