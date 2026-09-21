import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { updateAgencyTaxSettings } from '@/lib/agency/domain/agency.settings';
import { toPublicAgencySettings } from '@/lib/agency/types/agency-settings';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/agency/settings/tax (Module 17, §47/§52)
 *
 * Merge-patch the tax section (agency.settings.manage): defaultSacCode plus
 * the registration facts (registrationType / gstin / stateCode) which write
 * THROUGH to the Module 11 billingProfile — the single source of truth the
 * invoice issuer reads. §47 — settings establish defaults; the tax engine
 * determines actual invoice values. Registration fields without an existing
 * billing profile are an explicit 400 (legalName is required once, §7).
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
    const result = await updateAgencyTaxSettings(tenantId, body, {
      username: session.username,
      tenantId,
      log: (action: string, detail: string) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error ?? 'Failed to update tax settings' }, { status: result.status });
    }
    return NextResponse.json({ success: true, settings: toPublicAgencySettings(result.data) });
  } catch (error) {
    logError('agency:update tax settings error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to update tax settings' }, { status: 500 });
  }
}
